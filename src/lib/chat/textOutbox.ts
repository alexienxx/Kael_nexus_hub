import {
  sendDurableTextEnvelope,
  type ChatHttpResult,
  type ChatResponse,
} from "@/lib/api/chat";
import {
  deleteTextExchange,
  getTimelineCursor,
  ingestTimelinePage,
  listTextExchanges,
  markTextExchangeSending,
  patchTextExchange,
  verifyTextExchange,
  type DurableTextExchange,
} from "@/lib/chat/durableExchangeStore";

export type ChatOutcomeClassification =
  | "reply"
  | "replay"
  | "silence"
  | "in_progress"
  | "retryable_failure"
  | "recovery_required"
  | "terminal_failure";

export interface ClassifiedChatOutcome {
  kind: ChatOutcomeClassification;
  errorCode?: string;
  retryAfterMs?: number;
}

export interface TextOutboxDrainResult {
  clientMessageId: string;
  kind: ChatOutcomeClassification | "transport_deferred" | "integrity_failure";
  response?: ChatResponse;
  timelineMessages?: Record<string, unknown>[];
  nextAttemptAtMs?: number;
  errorCode?: string;
}

export interface TextOutboxDrainOptions {
  nowMs?: () => number;
  transport?: (requestBody: DurableTextExchange["requestBody"]) => Promise<ChatHttpResult>;
  maxDispatches?: number;
  /** Test-only crash-window hook; production callers leave it undefined. */
  faultInjector?: (
    checkpoint: TextOutboxFaultCheckpoint,
    entry: DurableTextExchange,
  ) => void | Promise<void>;
}

export type TextOutboxFaultCheckpoint =
  | "after_mark_sending"
  | "after_fetch"
  | "after_patch_committed"
  | "after_wal_commit"
  | "before_delete";

const DEFAULT_MAX_DISPATCHES = 20;
const MAX_AUTOMATIC_ATTEMPTS = 40;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

// Compatibility-only aliases observed in older experiments. They are not
// canonical Gate A values and never override a typed canonical receipt.
const COMPAT_IN_PROGRESS_STATUSES = new Set(["in_progress"]);
const COMPAT_REPLAY_STATUSES = new Set(["duplicate", "replayed"]);
const COMPAT_IN_PROGRESS_ERROR_CODES = new Set(["duplicate_exchange_in_progress"]);
const COMPAT_RECOVERY_ERROR_CODES = new Set(["exchange_recovery_required"]);
const COMPAT_REPLAY_ERROR_CODES = new Set(["duplicate_exchange"]);

let activeDrain: Promise<TextOutboxDrainResult[]> | null = null;
let drainRequestedWhileActive = false;

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function retryDelay(attempts: number, serverRetryAfterSeconds?: number): number {
  if (Number.isFinite(serverRetryAfterSeconds) && Number(serverRetryAfterSeconds) >= 0) {
    return Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, Number(serverRetryAfterSeconds) * 1_000));
  }
  return Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** Math.min(5, Math.max(0, attempts - 1)));
}

interface ReceiptView {
  clientMessageId?: string;
  sessionId?: string;
  exchangeId?: string;
  exchangeStatus?: string;
  outcomeKind?: string;
  userTurnId?: unknown;
  assistantTurnId?: unknown;
}

function receiptView(body: ChatResponse): ReceiptView {
  const detail = asRecord(body.detail);
  return {
    clientMessageId: asString(body.client_message_id ?? detail.client_message_id),
    sessionId: asString(body.session_id ?? detail.session_id),
    exchangeId: asString(body.exchange_id ?? detail.exchange_id),
    exchangeStatus: asString(body.exchange_status ?? detail.exchange_status ?? detail.status)?.toLowerCase(),
    outcomeKind: asString(body.outcome_kind ?? detail.outcome_kind ?? detail.outcome)?.toLowerCase(),
    userTurnId: body.user_turn_id ?? detail.user_turn_id,
    assistantTurnId: body.assistant_turn_id ?? detail.assistant_turn_id,
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function malformedBodySuffix(result: ChatHttpResult): string {
  return result.bodyParseError ? `_${result.bodyParseError}` : "";
}

export function classifyChatOutcome(result: ChatHttpResult): ClassifiedChatOutcome {
  const body = result.body ?? ({} as ChatResponse);
  const status = Number(result.status || 0);
  // FastAPI commonly wraps non-2xx payloads in `detail`; accept the same typed
  // exchange contract at either level without relying on human error prose.
  const detail = asRecord(body.detail);
  const detailError = asRecord(detail.error);
  const receipt = receiptView(body);
  const exchangeStatus = receipt.exchangeStatus;
  const outcomeKind = receipt.outcomeKind;
  const errorCode = asString(
    body.error?.code ?? detail.code ?? detailError.code ??
    (typeof body.detail === "string" ? body.detail : undefined),
  );
  const normalizedErrorCode = errorCode?.toLowerCase();
  const retryable = body.error?.retryable === true || detail.retryable === true || detailError.retryable === true;
  const hasReply = typeof body.reply === "string" && body.reply.length > 0;
  const hasAssistantTurn = body.assistant_turn_id !== undefined && body.assistant_turn_id !== null;

  const canonicalRecovery =
    exchangeStatus === "recovery_required" ||
    normalizedErrorCode === "cognition_outcome_requires_recovery";
  const compatRecovery =
    normalizedErrorCode !== undefined && COMPAT_RECOVERY_ERROR_CODES.has(normalizedErrorCode);

  // Recovery is a stronger server-side cognition fence than HTTP 202 or a
  // stale `processing` alias. It must be checked first so it can never be
  // converted into an automatic retry. Terminal fields mixed into the same
  // receipt are protocol-incoherent and therefore fail closed.
  if (canonicalRecovery || compatRecovery) {
    if (hasReply || hasAssistantTurn || outcomeKind === "reply" || outcomeKind === "silence") {
      return { kind: "terminal_failure", errorCode: "incoherent_recovery_receipt" };
    }
    return {
      kind: "recovery_required",
      errorCode: errorCode ?? "cognition_outcome_requires_recovery",
    };
  }

  if (
    status === 202 ||
    exchangeStatus === "processing" ||
    (exchangeStatus !== undefined && COMPAT_IN_PROGRESS_STATUSES.has(exchangeStatus)) ||
    normalizedErrorCode === "exchange_in_progress" ||
    (normalizedErrorCode !== undefined && COMPAT_IN_PROGRESS_ERROR_CODES.has(normalizedErrorCode))
  ) {
    if (hasReply || hasAssistantTurn || outcomeKind === "reply" || outcomeKind === "silence") {
      return { kind: "terminal_failure", errorCode: "incoherent_processing_receipt" };
    }
    return {
      kind: "in_progress",
      errorCode: errorCode ?? "exchange_in_progress",
      retryAfterMs: retryDelay(1, result.retryAfterSeconds),
    };
  }

  if (
    status >= 500 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    exchangeStatus === "failed_retryable" ||
    (status <= 0 && retryable)
  ) {
    return {
      kind: "retryable_failure",
      errorCode: errorCode ?? `http_${status || "transport"}${malformedBodySuffix(result)}`,
      retryAfterMs: retryDelay(1, result.retryAfterSeconds),
    };
  }

  const isSuccessfulHttp = status >= 200 && status < 300;
  if (isSuccessfulHttp && (outcomeKind === "silence" || exchangeStatus === "silence")) {
    if (outcomeKind !== "silence" || exchangeStatus !== "silence" || hasReply || body.error) {
      return { kind: "terminal_failure", errorCode: "incoherent_silence_receipt" };
    }
    if (!positiveInteger(receipt.userTurnId)) {
      return { kind: "terminal_failure", errorCode: "silence_invalid_user_turn_id" };
    }
    if (receipt.assistantTurnId !== undefined && receipt.assistantTurnId !== null) {
      return { kind: "terminal_failure", errorCode: "silence_has_assistant_turn_id" };
    }
    return { kind: "silence" };
  }

  const isCompatReplayReceipt =
    (exchangeStatus !== undefined && COMPAT_REPLAY_STATUSES.has(exchangeStatus)) ||
    (normalizedErrorCode !== undefined && COMPAT_REPLAY_ERROR_CODES.has(normalizedErrorCode));
  const isCanonicalReplyReceipt =
    outcomeKind === "reply" &&
    (exchangeStatus === "complete" || exchangeStatus === "response_committed");
  if ((isSuccessfulHttp || isCompatReplayReceipt) && hasReply) {
    if ((!isCanonicalReplyReceipt && !isCompatReplayReceipt) || body.error) {
      return { kind: "terminal_failure", errorCode: "incoherent_reply_receipt" };
    }
    const userTurnId = positiveInteger(receipt.userTurnId);
    const assistantTurnId = positiveInteger(receipt.assistantTurnId);
    if (!userTurnId || !assistantTurnId) {
      return { kind: "terminal_failure", errorCode: "committed_reply_invalid_turn_ids" };
    }
    if (userTurnId === assistantTurnId) {
      return { kind: "terminal_failure", errorCode: "committed_reply_turn_ids_collide" };
    }
    const duplicateReceipt =
      body.idempotent_replay === true ||
      isCompatReplayReceipt;
    return { kind: duplicateReceipt ? "replay" : "reply" };
  }

  if (status < 200 || status >= 300 || body.error) {
    return {
      kind: "terminal_failure",
      errorCode: errorCode ?? `http_${status || "invalid"}${malformedBodySuffix(result)}`,
    };
  }

  return { kind: "terminal_failure", errorCode: "unclassified_empty_chat_outcome" };
}

function sessionsCorrelate(requestSessionId: string, responseSessionId: string): boolean {
  if (requestSessionId === responseSessionId) return true;
  // The backend's explicit, bounded session alias contract maps the first-party
  // mobile channel to the canonical runtime session while preserving the same
  // shared conversation. No other fuzzy or prefix matching is permitted.
  return requestSessionId.toLowerCase() === "mobile_kael" && responseSessionId === "default";
}

function validateReceiptCorrelation(
  entry: DurableTextExchange,
  response: ChatResponse,
  kind: "reply" | "replay" | "silence" | "in_progress" | "recovery_required",
): string | undefined {
  const receipt = receiptView(response);
  if (receipt.clientMessageId !== entry.clientMessageId) return "receipt_client_message_id_mismatch";
  if (!receipt.sessionId || !sessionsCorrelate(entry.sessionId, receipt.sessionId)) {
    return "receipt_session_id_mismatch";
  }
  if (!receipt.exchangeId) return "receipt_missing_exchange_id";
  if (entry.exchangeId && receipt.exchangeId !== entry.exchangeId) return "receipt_exchange_id_mismatch";
  if (entry.userTurnId && String(receipt.userTurnId ?? "") !== entry.userTurnId) {
    return "receipt_user_turn_id_mismatch";
  }
  const userTurnId = positiveInteger(receipt.userTurnId);
  if (!userTurnId) return "receipt_invalid_user_turn_id";

  if (kind === "reply" || kind === "replay") {
    const assistantTurnId = positiveInteger(receipt.assistantTurnId);
    if (!assistantTurnId) return "receipt_invalid_assistant_turn_id";
    if (assistantTurnId === userTurnId) return "receipt_turn_ids_collide";
    if (entry.assistantTurnId && String(assistantTurnId) !== entry.assistantTurnId) {
      return "receipt_assistant_turn_id_mismatch";
    }
  } else if (receipt.assistantTurnId !== undefined && receipt.assistantTurnId !== null) {
    return "receipt_unexpected_assistant_turn_id";
  }
  return undefined;
}

function responseTimestamp(response: ChatResponse, fallbackSeconds: number): number {
  const direct = Number(response.timestamp ?? response.created_at ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(String(response.server_created_at ?? ""));
  return Number.isFinite(parsed) ? parsed / 1000 : fallbackSeconds;
}

function timelineMessagesForOutcome(
  entry: DurableTextExchange,
  response: ChatResponse,
  kind: "reply" | "replay" | "silence",
): Record<string, unknown>[] {
  const clientTimestamp = Date.parse(entry.requestBody.client_time) / 1000;
  const fallbackTimestamp = Number.isFinite(clientTimestamp) ? clientTimestamp : entry.createdAtMs / 1000;
  const receipt = receiptView(response);
  const userTurnId = positiveInteger(receipt.userTurnId)!;
  const userMessage: Record<string, unknown> = {
    id: userTurnId,
    backend_turn_id: userTurnId,
    client_message_id: entry.clientMessageId,
    text: entry.requestBody.text,
    sender: "user",
    role: "user",
    timestamp: fallbackTimestamp,
    metadata: {
      client_message_id: entry.clientMessageId,
      exchange_id: response.exchange_id,
    },
  };
  if (kind === "silence") return [userMessage];

  const assistantTurnId = positiveInteger(receipt.assistantTurnId)!;
  const assistantMessage: Record<string, unknown> = {
    id: assistantTurnId,
    backend_turn_id: assistantTurnId,
    client_message_id: entry.clientMessageId,
    text: response.reply,
    sender: response.sender ?? "kael",
    role: "assistant",
    timestamp: responseTimestamp(response, fallbackTimestamp),
    message_type: response.message_type ?? "text",
    delivery_mode: response.delivery_mode ?? "text",
    bubbles: response.bubbles,
    tts_url: response.tts_url,
    voice_audio: response.voice_audio,
    image_base64: response.image_base64,
    image_mime: response.image_mime,
    metadata: {
      ...(response.meta ?? {}),
      client_message_id: entry.clientMessageId,
      exchange_id: response.exchange_id,
      exchange_status: response.exchange_status,
      outcome_kind: response.outcome_kind,
      idempotent_replay: kind === "replay",
    },
  };
  return [userMessage, assistantMessage];
}

function receiptPatch(response: ChatResponse) {
  const receipt = receiptView(response);
  return Object.fromEntries(
    Object.entries({
      exchangeId: receipt.exchangeId,
      exchangeStatus: receipt.exchangeStatus,
      outcomeKind: receipt.outcomeKind,
      userTurnId: asString(receipt.userTurnId),
      assistantTurnId: asString(receipt.assistantTurnId),
    }).filter(([, value]) => value !== undefined),
  );
}

async function runDrain(options: TextOutboxDrainOptions): Promise<TextOutboxDrainResult[]> {
  const nowMs = options.nowMs ?? Date.now;
  const transport = options.transport ?? sendDurableTextEnvelope;
  const maxDispatches = Math.max(1, Math.min(100, options.maxDispatches ?? DEFAULT_MAX_DISPATCHES));
  const results: TextOutboxDrainResult[] = [];

  for (let dispatch = 0; dispatch < maxDispatches; dispatch += 1) {
    const entries = await listTextExchanges();
    // Strict FIFO: an unresolved A is an ordering barrier for B. The user must
    // explicitly retry or remove A before a later cognitive turn is dispatched.
    const entry = entries[0];
    if (!entry) break;
    if (entry.state === "recovery_required" || entry.state === "terminal_failed") break;

    const currentTime = nowMs();
    if (entry.nextAttemptAtMs > currentTime) {
      results.push({
        clientMessageId: entry.clientMessageId,
        kind: "transport_deferred",
        nextAttemptAtMs: entry.nextAttemptAtMs,
      });
      break;
    }

    if (!(await verifyTextExchange(entry))) {
      await patchTextExchange(entry.clientMessageId, {
        state: "terminal_failed",
        errorCode: "local_outbox_integrity_failure",
      }, currentTime);
      results.push({
        clientMessageId: entry.clientMessageId,
        kind: "integrity_failure",
        errorCode: "local_outbox_integrity_failure",
      });
      continue;
    }

    const sending = await markTextExchangeSending(entry.clientMessageId, currentTime);
    await options.faultInjector?.("after_mark_sending", sending);
    let transportResult: ChatHttpResult;
    try {
      transportResult = await transport(sending.requestBody);
    } catch {
      const exhausted = sending.attempts >= MAX_AUTOMATIC_ATTEMPTS;
      const delay = retryDelay(sending.attempts);
      const nextAttemptAtMs = currentTime + delay;
      await patchTextExchange(sending.clientMessageId, {
        state: exhausted ? "terminal_failed" : "queued",
        nextAttemptAtMs: exhausted ? 0 : nextAttemptAtMs,
        errorCode: exhausted ? "transport_retry_budget_exhausted" : "transport_unavailable",
      }, nowMs());
      results.push({
        clientMessageId: sending.clientMessageId,
        kind: exhausted ? "terminal_failure" : "transport_deferred",
        nextAttemptAtMs: exhausted ? undefined : nextAttemptAtMs,
        errorCode: exhausted ? "transport_retry_budget_exhausted" : "transport_unavailable",
      });
      break;
    }
    await options.faultInjector?.("after_fetch", sending);

    const classified = classifyChatOutcome(transportResult);
    const response = transportResult.body;
    if (
      classified.kind === "reply" ||
      classified.kind === "replay" ||
      classified.kind === "silence" ||
      classified.kind === "in_progress" ||
      classified.kind === "recovery_required"
    ) {
      const correlationError = validateReceiptCorrelation(sending, response, classified.kind);
      if (correlationError) {
        await patchTextExchange(sending.clientMessageId, {
          state: "terminal_failed",
          nextAttemptAtMs: 0,
          errorCode: correlationError,
        }, nowMs());
        results.push({
          clientMessageId: sending.clientMessageId,
          kind: "terminal_failure",
          response,
          errorCode: correlationError,
        });
        break;
      }
    }
    if (classified.kind === "reply" || classified.kind === "replay" || classified.kind === "silence") {
      await patchTextExchange(sending.clientMessageId, {
        state: "server_committed",
        nextAttemptAtMs: 0,
        errorCode: undefined,
        ...receiptPatch(response),
      }, nowMs());
      await options.faultInjector?.("after_patch_committed", sending);
      const messages = timelineMessagesForOutcome(sending, response, classified.kind);
      const cursor = await getTimelineCursor(sending.timelineKey);
      await ingestTimelinePage({
        timelineKey: sending.timelineKey,
        fromCursor: cursor,
        // A direct reply does not prove that every interleaved timeline row has
        // been observed.  Persist it locally but leave the catch-up cursor in
        // place; /history/pending advances the contiguous cursor later.
        nextCursor: cursor,
        cursorKind: "snapshot",
        messages,
        batchId: `exchange:${sending.clientMessageId}:${response.exchange_id ?? classified.kind}`,
      });
      await options.faultInjector?.("after_wal_commit", sending);
      await options.faultInjector?.("before_delete", sending);
      await deleteTextExchange(sending.clientMessageId);
      results.push({
        clientMessageId: sending.clientMessageId,
        kind: classified.kind,
        response,
        timelineMessages: messages,
      });
      continue;
    }

    if (classified.kind === "in_progress" || classified.kind === "retryable_failure") {
      const exhausted = sending.attempts >= MAX_AUTOMATIC_ATTEMPTS;
      const delay = retryDelay(sending.attempts, transportResult.retryAfterSeconds);
      const nextAttemptAtMs = currentTime + delay;
      await patchTextExchange(sending.clientMessageId, {
        state: exhausted ? "terminal_failed" : classified.kind === "in_progress" ? "in_progress" : "queued",
        nextAttemptAtMs: exhausted ? 0 : nextAttemptAtMs,
        errorCode: exhausted ? "chat_retry_budget_exhausted" : classified.errorCode,
        ...receiptPatch(response),
      }, nowMs());
      results.push({
        clientMessageId: sending.clientMessageId,
        kind: exhausted ? "terminal_failure" : classified.kind,
        response,
        nextAttemptAtMs: exhausted ? undefined : nextAttemptAtMs,
        errorCode: exhausted ? "chat_retry_budget_exhausted" : classified.errorCode,
      });
      break;
    }

    await patchTextExchange(sending.clientMessageId, {
      state: classified.kind === "recovery_required" ? "recovery_required" : "terminal_failed",
      nextAttemptAtMs: 0,
      errorCode: classified.errorCode,
      ...receiptPatch(response),
    }, nowMs());
    results.push({
      clientMessageId: sending.clientMessageId,
      kind: classified.kind,
      response,
      errorCode: classified.errorCode,
    });
  }

  return results;
}

/** One process-local FIFO drain. Concurrent boot/resume/send triggers share it. */
export function drainTextOutbox(options: TextOutboxDrainOptions = {}): Promise<TextOutboxDrainResult[]> {
  if (activeDrain) {
    drainRequestedWhileActive = true;
    return activeDrain;
  }
  activeDrain = (async () => {
    const combined: TextOutboxDrainResult[] = [];
    do {
      drainRequestedWhileActive = false;
      combined.push(...await runDrain(options));
    } while (drainRequestedWhileActive);
    return combined;
  })().finally(() => {
    activeDrain = null;
  });
  return activeDrain;
}

export async function nextTextOutboxAttemptAt(): Promise<number | null> {
  const entries = await listTextExchanges();
  const head = entries[0];
  if (!head || head.state === "recovery_required" || head.state === "terminal_failed") return null;
  return Math.max(0, head.nextAttemptAtMs);
}

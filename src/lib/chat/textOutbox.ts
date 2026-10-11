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
  | "authentication_required"
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

/** Never re-promote an untrusted response after classification/correlation
 * has rejected it. The drain result is the validated presentation boundary.
 */
export function outboxDeliveryStatus(result: TextOutboxDrainResult): string {
  return result.kind === "reply" || result.kind === "replay" ? "complete" : result.kind;
}

export interface TextOutboxDrainOptions {
  trigger?: TextOutboxDrainTrigger;
  nowMs?: () => number;
  transport?: (requestBody: DurableTextExchange["requestBody"]) => Promise<ChatHttpResult>;
  maxDispatches?: number;
  /** Test-only crash-window hook; production callers leave it undefined. */
  faultInjector?: (
    checkpoint: TextOutboxFaultCheckpoint,
    entry: DurableTextExchange,
  ) => void | Promise<void>;
}

export type TextOutboxDrainTrigger = "automatic" | "reconnect" | "resume" | "explicit_retry";

/** A timer, mount/render or new send is never consent to release a defer. */
export function releasesDeferredText(trigger: TextOutboxDrainTrigger = "automatic"): boolean {
  return trigger === "reconnect" || trigger === "resume" || trigger === "explicit_retry";
}

export function deferredDispatchRevisions(
  entries: DurableTextExchange[], trigger: TextOutboxDrainTrigger, triggeredAtMs: number,
): Map<string, number> {
  return new Map(releasesDeferredText(trigger)
    ? entries.filter((entry) => entry.state === "queued_by_user" && entry.updatedAtMs < triggeredAtMs)
      .map((entry) => [entry.clientMessageId, entry.updatedAtMs])
    : []);
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
interface PendingDrain {
  options: TextOutboxDrainOptions;
  deferredRevisions: Promise<Map<string, number>>;
}
let pendingDrain: PendingDrain | null = null;
// A real resume may arrive while an older FIFO item is still processing. Keep
// its exact revision grants until that barrier clears; a later defer revision
// cannot inherit them. This is dispatch consent, never a success receipt.
const releasedDeferredRevisions = new Map<string, number>();

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
  const canonicalErrorCode = normalizedErrorCode?.replace(/-/g, "_");
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

  // Authentication failures are a user-action barrier, not a terminal
  // discard and not an automatic retry storm. Preserve the exact envelope in
  // FIFO until Settings contains a valid credential and the user retries it.
  if (
    status === 401 ||
    status === 403 ||
    (status === 503 && canonicalErrorCode === "api_auth_not_configured")
  ) {
    return {
      kind: "authentication_required",
      errorCode: errorCode ?? `http_${status}${malformedBodySuffix(result)}`,
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
      exchange_status: response.exchange_status ?? kind,
      outcome_kind: response.outcome_kind ?? kind,
      durable_outbox: true,
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

async function runDrain(options: TextOutboxDrainOptions, deferredRevisions: Map<string, number>): Promise<TextOutboxDrainResult[]> {
  const nowMs = options.nowMs ?? Date.now;
  const transport = options.transport ?? sendDurableTextEnvelope;
  const maxDispatches = Math.max(1, Math.min(100, options.maxDispatches ?? DEFAULT_MAX_DISPATCHES));
  const results: TextOutboxDrainResult[] = [];

  for (let dispatch = 0; dispatch < maxDispatches; dispatch += 1) {
    const entries = await listTextExchanges();
    const deferredIds = new Set(entries.filter((candidate) => candidate.state === "queued_by_user").map((candidate) => candidate.clientMessageId));
    for (const id of deferredRevisions.keys()) {
      if (!deferredIds.has(id)) deferredRevisions.delete(id);
    }
    // Strict FIFO: an unresolved A is an ordering barrier for B. The user must
    // explicitly retry or remove A before a later cognitive turn is dispatched.
    const entry = entries[0];
    if (!entry) break;
    if (entry.state === "queued_by_user" && deferredRevisions.get(entry.clientMessageId) !== entry.updatedAtMs) break;
    if (
      entry.state === "authentication_required" ||
      entry.state === "recovery_required" ||
      entry.state === "terminal_failed"
    ) break;

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

    const wasQueuedByUser = entry.state === "queued_by_user";
    const sending = await markTextExchangeSending(entry.clientMessageId, currentTime, {
      snapshot: entry,
      deferredRevision: deferredRevisions.get(entry.clientMessageId),
    });
    // A manual defer/removal raced with this reader. It is a normal ordering
    // barrier, not a storage failure, and must never send the stale snapshot.
    if (!sending) break;
    deferredRevisions.delete(entry.clientMessageId);
    await options.faultInjector?.("after_mark_sending", sending);
    let transportResult: ChatHttpResult;
    try {
      transportResult = await transport(sending.requestBody);
    } catch {
      const exhausted = sending.attempts >= MAX_AUTOMATIC_ATTEMPTS;
      const delay = retryDelay(sending.attempts);
      const nextAttemptAtMs = currentTime + delay;
      await patchTextExchange(sending.clientMessageId, {
        state: exhausted ? "terminal_failed" : wasQueuedByUser ? "queued_by_user" : "queued",
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
        state: exhausted
          ? "terminal_failed"
          : classified.kind === "in_progress"
            ? "in_progress"
            : wasQueuedByUser
              ? "queued_by_user"
              : "queued",
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
      state: classified.kind === "authentication_required"
        ? "authentication_required"
        : classified.kind === "recovery_required"
          ? "recovery_required"
          : "terminal_failed",
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
  const trigger = options.trigger ?? "automatic";
  const triggeredAtMs = (options.nowMs ?? Date.now)();
  const deferredRevisions = releasesDeferredText(trigger)
    ? listTextExchanges().then((entries) => deferredDispatchRevisions(entries, trigger, triggeredAtMs))
    : Promise.resolve(new Map<string, number>());
  // Capture resume consent now, not after an unrelated in-flight send ends.
  // Coalescing preserves that consent even when a subsequent timer arrives.
  pendingDrain = pendingDrain
    ? {
        options: pendingDrain.options,
        deferredRevisions: Promise.all([pendingDrain.deferredRevisions, deferredRevisions])
          .then(([previous, incoming]) => new Map([...previous, ...incoming])),
      }
    : { options, deferredRevisions };
  // The active transport may take time. Retain any snapshot failure for the
  // awaited consumer, but do not emit an unhandled rejection while it waits.
  void pendingDrain.deferredRevisions.catch(() => {});
  if (activeDrain) {
    return activeDrain;
  }
  activeDrain = (async () => {
    const combined: TextOutboxDrainResult[] = [];
    try {
      while (pendingDrain) {
        const request = pendingDrain;
        pendingDrain = null;
        for (const [id, revision] of await request.deferredRevisions) {
          releasedDeferredRevisions.set(id, revision);
        }
        combined.push(...await runDrain(request.options, releasedDeferredRevisions));
      }
      return combined;
    } finally {
      // Clear before resolving the shared promise, so a new trigger cannot be
      // queued between completion and a later .finally microtask and get lost.
      pendingDrain = null;
      activeDrain = null;
    }
  })();
  return activeDrain;
}

export async function nextTextOutboxAttemptAt(): Promise<number | null> {
  const entries = await listTextExchanges();
  const head = entries[0];
  if (
    !head ||
    (head.state === "queued_by_user" && releasedDeferredRevisions.get(head.clientMessageId) !== head.updatedAtMs) ||
    head.state === "authentication_required" ||
    head.state === "recovery_required" ||
    head.state === "terminal_failed"
  ) return null;
  return Math.max(0, head.nextAttemptAtMs);
}

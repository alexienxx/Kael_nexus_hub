import type { ChatMessage } from "@/types";

export type VoiceNoteReceiptPresentation = "reply" | "silence" | "non_assistant";

/** Rendering eligibility only: a receipt/message ID is not an assistant turn.
 * This does not reconstruct the HTTP status or decide whether Arrakis speaks.
 */
export function voiceNoteReceiptPresentation(response: unknown): VoiceNoteReceiptPresentation {
  if (!response || typeof response !== "object" || Array.isArray(response)) return "non_assistant";
  const receipt = response as Record<string, unknown>;
  const userTurn = receipt.user_turn_id;
  const assistantTurn = receipt.assistant_turn_id;
  if (receipt.error != null || typeof userTurn !== "number" ||
      !Number.isSafeInteger(userTurn) || userTurn <= 0) return "non_assistant";
  if (receipt.outcome_kind === "silence" && receipt.exchange_status === "silence" &&
      (receipt.reply == null || receipt.reply === "") && assistantTurn == null) return "silence";
  if (receipt.outcome_kind === "reply" &&
      (receipt.exchange_status === "complete" || receipt.exchange_status === "response_committed") &&
      typeof receipt.reply === "string" && receipt.reply.trim().length > 0 &&
      typeof assistantTurn === "number" && Number.isSafeInteger(assistantTurn) &&
      assistantTurn > 0 && assistantTurn !== userTurn) return "reply";
  return "non_assistant";
}

/** Receipt fields from canonical history outrank local outbox presentation.
 * Only use this after the message identity has been reconciled by its IDs.
 */
export function mergeDeliveryMetadata(
  canonical: ChatMessage["meta"],
  local: ChatMessage["meta"],
): NonNullable<ChatMessage["meta"]> {
  const merged = { ...canonical, ...local };
  if (typeof canonical?.exchange_status === "string" && canonical.exchange_status.length > 0) {
    for (const key of ["exchange_status", "outcome_kind", "exchange_id", "exchange_error_code", "exchange_receipt_count"]) {
      delete merged[key];
      if (canonical[key] !== undefined) merged[key] = canonical[key];
    }
  }
  return merged;
}

export type AssistantIdSource =
  | "assistant_turn_id"
  | "backend_turn_id"
  | "message_id"
  | "id"
  | "fallback";

export interface AssistantIdentityResult {
  messageId: string;
  backendTurnId?: string;
  idSource: AssistantIdSource;
}

export interface BackendMessageIdentity {
  sender: ChatMessage["sender"];
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
}

const DELIVERY_MODES = new Set<ChatMessage["delivery_mode"]>([
  "text",
  "voice_note",
  "image",
  "video_message",
  "voice_call",
]);

/** Preserve the canonical native-voice presentation across history reloads. */
export function resolveBackendDeliveryMode(
  rawMessage: Record<string, unknown>,
): ChatMessage["delivery_mode"] | undefined {
  const explicit = rawMessage.delivery_mode ?? rawMessage.deliveryMode;
  if (typeof explicit === "string" && DELIVERY_MODES.has(explicit as ChatMessage["delivery_mode"])) {
    return explicit as ChatMessage["delivery_mode"];
  }
  return rawMessage.message_type === "voice_note" || rawMessage.input_mode === "voice_note"
    ? "voice_note"
    : undefined;
}

export function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function asFiniteTimestamp(value: unknown): number | undefined {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

/**
 * Preserve first-class external-agent identity when replaying canonical
 * history. History rows expose `role` plus durable provenance in metadata,
 * while live replies may expose the compatibility `sender`/agent fields.
 */
export function resolveBackendMessageIdentity(
  rawMessage: Record<string, unknown>,
): BackendMessageIdentity {
  const rawSender = asString(rawMessage.sender);
  const rawRole = asString(rawMessage.role);
  const sender: ChatMessage["sender"] =
    rawSender === "user" || rawSender === "kael" || rawSender === "external_agent"
      ? rawSender
      : rawRole === "user"
        ? "user"
        : rawRole === "external_agent"
          ? "external_agent"
          : "kael";

  const metadata = asObject(rawMessage.meta ?? rawMessage.metadata);
  const agentId =
    asString(rawMessage.agent_id) ?? asString(metadata.external_agent_id);
  const provider = asString(metadata.external_provider);
  const agentName =
    asString(rawMessage.agent_name) ??
    (sender === "external_agent" && provider && agentId
      ? `${provider} · ${agentId}`
      : sender === "external_agent"
        ? provider ?? agentId
        : undefined);

  return {
    sender,
    agentId,
    agentName,
    agentAvatar: asString(rawMessage.agent_avatar),
  };
}

export function resolveAssistantIdentity(
  response: Record<string, unknown>,
  sessionId: string,
  replyText: string,
  fallbackTsSec: number,
): AssistantIdentityResult {
  const raw = asObject(response.raw);

  const assistantTurnId =
    asString(response.assistant_turn_id) ??
    asString(raw.assistant_turn_id) ??
    asString(raw.turn_id);

  if (assistantTurnId) {
    return {
      messageId: `assistant-turn:${assistantTurnId}`,
      backendTurnId: assistantTurnId,
      idSource: "assistant_turn_id",
    };
  }

  const backendTurnId =
    asString(response.backend_turn_id) ??
    asString(raw.backend_turn_id) ??
    asString(response.turn_id);

  if (backendTurnId) {
    return {
      messageId: `assistant-backend:${backendTurnId}`,
      backendTurnId,
      idSource: "backend_turn_id",
    };
  }

  const messageId = asString(response.message_id) ?? asString(raw.message_id);
  if (messageId) {
    return {
      messageId: `assistant-message:${messageId}`,
      idSource: "message_id",
    };
  }

  const genericId = asString(response.id) ?? asString(raw.id);
  if (genericId) {
    return {
      messageId: `assistant-id:${genericId}`,
      idSource: "id",
    };
  }

  const traceLike =
    asString(response.trace_id) ??
    asString(raw.trace_id) ??
    asString(response.request_id) ??
    asString(raw.request_id) ??
    asString(response.generation_id) ??
    asString(raw.generation_id) ??
    "no-trace";

  const ts =
    asFiniteTimestamp(response.timestamp) ??
    asFiniteTimestamp(raw.timestamp) ??
    asFiniteTimestamp(response.created_at) ??
    asFiniteTimestamp(raw.created_at) ??
    (Number.isFinite(fallbackTsSec) && fallbackTsSec > 0 ? fallbackTsSec : 0);

  const contentHash = stableHash((replyText || "").trim());
  return {
    messageId: `assistant:${sessionId}:${traceLike}:${ts}:${contentHash}`,
    idSource: "fallback",
  };
}

export function resolveHistoryMessageId(rawMessage: Record<string, unknown>, sessionId: string): string {
  const raw = asObject(rawMessage.raw);
  const firstId =
    asString(rawMessage.id) ??
    asString(rawMessage.turn_id) ??
    asString(rawMessage.backend_turn_id) ??
    asString(rawMessage.assistant_turn_id) ??
    asString(rawMessage.message_id) ??
    asString(raw.id);

  if (firstId) {
    return `hist:${firstId}`;
  }

  const sender = asString(rawMessage.sender) ?? asString(rawMessage.role) ?? "unknown";
  const ts =
    asFiniteTimestamp(rawMessage.timestamp) ??
    asFiniteTimestamp(rawMessage.ts) ??
    asFiniteTimestamp(raw.timestamp) ??
    0;
  const content =
    asString(rawMessage.text) ??
    asString(rawMessage.content) ??
    asString(raw.preview) ??
    "";
  const clientMsgId = asString(rawMessage.client_message_id) ?? asString(rawMessage["client_message_id"]);
  const hashInput = `${sender}|${ts}|${clientMsgId ?? ""}|${content}`;
  return `hist:${sessionId}:${stableHash(hashInput)}`;
}

export function normalizeAfterTs(lastFetchTs: number): number {
  if (!Number.isFinite(lastFetchTs) || lastFetchTs < 0) return 0;
  return lastFetchTs;
}

export function mergeMessagesIdempotent(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byBackendId = new Set(existing.map((m) => m.backend_turn_id).filter(Boolean));
  // client_message_id identifies the logical USER submission. The canonical
  // assistant reply may echo the same id for causal linkage; it is not a
  // duplicate of the user turn.
  const byClientId = new Set(
    existing.filter((m) => m.sender === "user").map((m) => m.client_message_id).filter(Boolean),
  );
  const byStableId = new Set(existing.map((m) => m.id));

  const newItems = incoming.filter((m) => {
    if (m.backend_turn_id && byBackendId.has(m.backend_turn_id)) return false;
    if (m.sender === "user" && m.client_message_id && byClientId.has(m.client_message_id)) return false;
    if (byStableId.has(m.id)) return false;
    if (m.backend_turn_id) byBackendId.add(m.backend_turn_id);
    if (m.sender === "user" && m.client_message_id) byClientId.add(m.client_message_id);
    byStableId.add(m.id);
    return true;
  });

  // Deduplication must not discard a newer canonical receipt for an existing
  // USER bubble (SSE/catch-up and durable WAL use this path as well as reload).
  const incomingUsers = new Map(incoming.filter((m) => m.sender === "user" && m.client_message_id)
    .map((m) => [m.client_message_id, m]));
  const incomingUserTurns = new Map(incoming.filter((m) => m.sender === "user" && m.backend_turn_id)
    .map((m) => [m.backend_turn_id, m]));
  const reconciled = existing.map((message) => {
    if (message.sender !== "user") return message;
    const canonical = (message.client_message_id ? incomingUsers.get(message.client_message_id) : undefined)
      ?? (message.backend_turn_id ? incomingUserTurns.get(message.backend_turn_id) : undefined);
    if (canonical?.client_message_id && message.client_message_id && canonical.client_message_id !== message.client_message_id) return message;
    if (!canonical || canonical.meta?.durable_outbox === true || !canonical.meta?.exchange_status) return message;
    return { ...message, backend_turn_id: canonical.backend_turn_id ?? message.backend_turn_id,
      meta: mergeDeliveryMetadata(canonical.meta, message.meta) };
  });
  const merged = [...reconciled, ...newItems];
  merged.sort((a, b) => {
    // FIXED 2026-05-09: Sort by TIMESTAMP (chronological order is canonical).
    // Timestamps are NORMALIZED at ingestion time in mapBackendMsg via getCanonicalTimeMs(),
    // so they are ALWAYS valid and non-zero. We just use the stored value here—never
    // recalculate Date.now() during sort, which would violate stable ordering.
    // backend_turn_id used only as a tie-breaker.
    const aTs = a.timestamp ?? 0;
    const bTs = b.timestamp ?? 0;
    if (aTs !== bTs) return aTs - bTs;
    
    // Tie-breaker: use backend_turn_id if both exist
    const aBackend = a.backend_turn_id ? Number(a.backend_turn_id) : NaN;
    const bBackend = b.backend_turn_id ? Number(b.backend_turn_id) : NaN;
    if (!Number.isNaN(aBackend) && !Number.isNaN(bBackend)) {
      return aBackend - bBackend;
    }
    
    // Final tie-breaker: id
    return a.id.localeCompare(b.id);
  });

  return merged;
}

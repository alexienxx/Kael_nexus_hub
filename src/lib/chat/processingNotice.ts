import type { TextOutboxDrainResult } from "@/lib/chat/textOutbox";
import type { ChatMessage } from "@/types";
import type { DurableTextExchange } from "@/lib/chat/durableExchangeStore";

export type ChatProcessingState = {
  kind: Exclude<TextOutboxDrainResult["kind"], "reply" | "replay"> | "waiting" | "unconfirmed";
  errorCode?: string;
  clientMessageId?: string;
};

/** Current local dispatch supersedes an older transient presentation, not its receipt. */
export function textOutboxMessageStatus(entry: DurableTextExchange): string {
  if (["recovery_required", "terminal_failed", "authentication_required"].includes(entry.state)) return entry.state;
  if (entry.state === "sending") return "sending";
  if (entry.errorCode && entry.attempts > 0 && ["queued", "queued_by_user"].includes(entry.state)) return "retryable_failure";
  return entry.exchangeStatus ?? entry.state;
}

export function chatProcessingNoticeFromOutbox(entry: DurableTextExchange): ChatProcessingState | null {
  if (entry.state === "in_progress") return { kind: "in_progress", clientMessageId: entry.clientMessageId };
  if (entry.state === "queued" || entry.state === "sending") return { kind: "waiting", clientMessageId: entry.clientMessageId };
  return null;
}

export function applyTextOutboxSendingNotice(
  current: ChatProcessingState | null, entry: DurableTextExchange,
): ChatProcessingState | null {
  if (entry.state !== "sending" || (current?.clientMessageId && current.clientMessageId !== entry.clientMessageId)) return current;
  // Keep a classified processing receipt; sending alone certifies no server phase.
  return current?.kind === "in_progress" ? current : chatProcessingNoticeFromOutbox(entry);
}

export function applyTextOutboxSendingMessage(message: ChatMessage, entry: DurableTextExchange): ChatMessage {
  if (entry.state !== "sending" || message.sender !== "user"
    || message.client_message_id !== entry.clientMessageId
    || !["transport_deferred", "retryable_failure"].includes(String(message.meta?.exchange_status ?? ""))) return message;
  // Preserve body, IDs, historical error and any final/canonical receipt.
  return { ...message, meta: { ...(message.meta ?? {}), exchange_status: textOutboxMessageStatus(entry) } };
}

/** Presentation consumes the outbox's validated outcome, never raw HTTP fields. */
export function chatProcessingNoticeFromOutcome(
  result: Pick<TextOutboxDrainResult, "kind" | "errorCode"> & Partial<Pick<TextOutboxDrainResult, "clientMessageId">>,
): ChatProcessingState | null {
  return result.kind === "reply" || result.kind === "replay"
    ? null
    : { kind: result.kind, errorCode: result.errorCode, clientMessageId: result.clientMessageId };
}

export function applyChatProcessingOutcome(
  current: ChatProcessingState | null, result: TextOutboxDrainResult,
): ChatProcessingState | null {
  // An older FIFO result cannot replace the notice for a newer local request.
  if (current?.clientMessageId && current.clientMessageId !== result.clientMessageId) return current;
  return chatProcessingNoticeFromOutcome(result);
}

export function reconcileChatProcessingMessages(
  current: ChatProcessingState | null, committed: ChatMessage[],
): ChatProcessingState | null {
  if (!current) return null;
  const assistant = committed.filter((message) => message.sender === "kael"
    && /^[1-9]\d*$/.test(message.backend_turn_id ?? ""));
  if (!assistant.length) return current;
  if (current.clientMessageId && assistant.some((message) => message.client_message_id === current.clientMessageId)) {
    return null;
  }
  // A durable assistant row without correlation does not close this request,
  // but an earlier processing snapshot must no longer look like a live phase.
  return current.kind === "in_progress" ? { ...current, kind: "unconfirmed" } : current;
}

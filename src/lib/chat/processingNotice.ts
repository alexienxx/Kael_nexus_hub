import type { TextOutboxDrainResult } from "@/lib/chat/textOutbox";
import type { ChatMessage } from "@/types";

export type ChatProcessingState = {
  kind: Exclude<TextOutboxDrainResult["kind"], "reply" | "replay"> | "waiting" | "unconfirmed";
  errorCode?: string;
  clientMessageId?: string;
};

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

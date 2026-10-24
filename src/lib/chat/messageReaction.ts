import type { ChatMessage } from "@/types";

export interface MessageReaction {
  schema: "arrakis.message-reaction.v1";
  operation_id: string;
  target_turn_id: number;
  symbol: string;
  owner: "D4";
}

// Wire vocabulary only. Selection belongs to the existing D4 owner.
const symbols = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏"]);

function parseMessageReaction(value: unknown): MessageReaction | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(",") !== "operation_id,owner,schema,symbol,target_turn_id"
    || item.schema !== "arrakis.message-reaction.v1" || item.owner !== "D4"
    || typeof item.operation_id !== "string" || !/^[0-9a-f]{64}$/.test(item.operation_id)
    || typeof item.target_turn_id !== "number" || !Number.isSafeInteger(item.target_turn_id)
    || item.target_turn_id <= 0 || typeof item.symbol !== "string" || !symbols.has(item.symbol)) {
    return undefined;
  }
  return item as unknown as MessageReaction;
}

export function messageReactionsByTarget(messages: readonly ChatMessage[]): Map<string, MessageReaction> {
  const result = new Map<string, MessageReaction>();
  const seen = new Set<string>();
  const users = new Set(messages.filter((message) => message.sender === "user"
    && message.backend_turn_id).map((message) => message.backend_turn_id as string));
  // Canonical assistant IDs determine order; duplicate HTTP/history replay adds no badge.
  const committed = messages.filter((message) => message.sender === "kael"
    && message.backend_turn_id && Number.isSafeInteger(Number(message.backend_turn_id))
    && Number(message.backend_turn_id) > 0).sort((left, right) =>
      Number(left.backend_turn_id) - Number(right.backend_turn_id));
  for (const message of committed) {
    const reaction = parseMessageReaction(message.meta?.message_reaction);
    if (!reaction || seen.has(reaction.operation_id)) continue;
    const target = String(reaction.target_turn_id);
    if (!users.has(target) || reaction.target_turn_id >= Number(message.backend_turn_id)) continue;
    const boundUserTurn = message.meta?.user_turn_id;
    if (boundUserTurn != null && Number(boundUserTurn) !== reaction.target_turn_id) continue;
    seen.add(reaction.operation_id);
    result.set(target, reaction);
  }
  return result;
}

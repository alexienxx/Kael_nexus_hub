import { describe, expect, it } from "vitest";
import { classifyChatOutcome, outboxDeliveryStatus, type TextOutboxDrainResult } from "@/lib/chat/textOutbox";

describe("validated delivery presentation", () => {
  it.each(["terminal_failure", "integrity_failure", "recovery_required", "authentication_required", "retryable_failure"] as const)(
    "does not let a raw complete response override %s", (kind) => {
      const result = { clientMessageId: "id", kind, response: { exchange_status: "complete" } } as TextOutboxDrainResult;
      expect(outboxDeliveryStatus(result)).toBe(kind);
    },
  );

  it("carries a rejected receipt through the actual classifier into presentation", () => {
    const result = { status: 200, statusText: "OK", body: { exchange_status: "complete", outcome_kind: "reply", reply: "x",
      user_turn_id: 42, assistant_turn_id: 42 } };
    const classified = classifyChatOutcome(result);
    expect(classified.errorCode).toBe("committed_reply_turn_ids_collide");
    expect(outboxDeliveryStatus({ clientMessageId: "id", ...classified, response: result.body })).toBe("terminal_failure");
  });

  it.each(["reply", "replay", "silence"] as const)("preserves accepted %s", (kind) => {
    expect(outboxDeliveryStatus({ clientMessageId: "id", kind })).toBe(kind === "silence" ? "silence" : "complete");
  });
});

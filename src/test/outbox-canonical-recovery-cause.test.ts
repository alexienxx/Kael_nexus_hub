import { describe, expect, it } from "vitest";
import { classifyChatOutcome, receiptPatch, validateReceiptCorrelation } from "@/lib/chat/textOutbox";
import { nextOrderedTextExchange, type DurableTextExchange } from "@/lib/chat/durableExchangeStore";
import type { ChatHttpResult, ChatResponse } from "@/lib/api/chat";

// Declared receipt/value controls only: no transport, IndexedDB or backend substitute.
const generic = "cognition_outcome_requires_recovery";
function entry(id = "declared-recovery-control"): DurableTextExchange {
  return {
    schemaVersion: 1, clientMessageId: id, timelineKey: "declared", sessionId: "default",
    requestBody: { text: "Declared unsent source.", session_id: "default", client_time: "2026-11-06T00:00:00Z", client_message_id: id },
    bodyHash: "declared-value-only-not-a-runtime-integrity-proof", state: "recovery_required", attempts: 1,
    createdAtMs: 1, updatedAtMs: 2, nextAttemptAtMs: 0, exchangeId: "declared-exchange",
    exchangeStatus: "recovery_required", userTurnId: "101", errorCode: generic,
  };
}
function receipt(fields: Partial<ChatResponse> = {}): ChatResponse {
  return {
    reply: "", session_id: "default", client_message_id: "declared-recovery-control",
    exchange_id: "declared-exchange", exchange_status: "recovery_required", user_turn_id: 101,
    idempotent_replay: true, error: { code: generic, retryable: false }, ...fields,
  };
}
function classify(body: ChatResponse) {
  const response: ChatHttpResult = { status: 409, statusText: "Conflict", body };
  return classifyChatOutcome(response);
}

describe("canonical recovery cause remains distinct from generic replay error", () => {
  it("preserves both codes and only releases later work after a known stopped cause", () => {
    const previous = entry();
    const later = { ...entry("later-declared-control"), state: "queued" as const, createdAtMs: 3 };
    const raw = receipt({ failure_code: "deliberation_unavailable" });
    const beforeSource = JSON.stringify(previous.requestBody);
    const beforeReceipt = JSON.stringify(raw);
    const classified = classify(raw);
    expect(classified).toEqual({ kind: "recovery_required", errorCode: generic, canonicalFailureCode: "deliberation_unavailable" });
    expect(validateReceiptCorrelation(previous, raw, "recovery_required")).toBeUndefined();
    expect(nextOrderedTextExchange([previous, later])).toBe(previous);
    const qualified = { ...previous, canonicalFailureCode: classified.canonicalFailureCode };
    expect(nextOrderedTextExchange([qualified, later])).toBe(later);
    expect(qualified.errorCode).toBe(generic);
    expect(JSON.stringify(qualified.requestBody)).toBe(beforeSource);
    expect(JSON.stringify(raw)).toBe(beforeReceipt);
    expect(qualified.state).toBe("recovery_required");
  });

  it.each([undefined, "unrecognized_worker_outcome", "expired_worker_lease", "assistant_commit_ack_unknown"])(
    "does not release unknown or uncertain canonical cause %s", (failure_code) => {
      const classified = classify(receipt({ failure_code }));
      const blocked = { ...entry(), canonicalFailureCode: classified.canonicalFailureCode };
      expect(nextOrderedTextExchange([blocked, { ...entry("later"), state: "queued" }])).toBe(blocked);
      expect(classified.errorCode).toBe(generic);
    },
  );

  it("keeps an unknown canonical cause authoritative over a legacy known transport code", () => {
    const blocked = { ...entry(), errorCode: "deliberation_unavailable", canonicalFailureCode: "expired_worker_lease" };
    expect(nextOrderedTextExchange([blocked, { ...entry("later"), state: "queued" }])).toBe(blocked);
  });

  it("clears a stale cause when the correlated receipt no longer supplies one", () => {
    const previous = { ...entry(), canonicalFailureCode: "deliberation_unavailable" };
    const classified = classify(receipt());
    const patched = { ...previous, ...receiptPatch(receipt(), classified.canonicalFailureCode) };
    expect(Object.prototype.hasOwnProperty.call(receiptPatch(receipt()), "canonicalFailureCode")).toBe(true);
    expect(patched.canonicalFailureCode).toBeUndefined();
    expect(nextOrderedTextExchange([patched])).toBe(patched);
    expect(previous.canonicalFailureCode).toBe("deliberation_unavailable");
  });

  it.each(["queued", "sending", "in_progress"] as const)("does not skip %s even with a known cause", (state) => {
    const blocked = { ...entry(), state, canonicalFailureCode: "deliberation_unavailable" };
    expect(nextOrderedTextExchange([blocked, { ...entry("later"), state: "queued" }])).toBe(blocked);
  });

  it("does not treat a generic error alongside processing as a canonical stopped cause", () => {
    const raw = receipt({ exchange_status: "processing", failure_code: "deliberation_unavailable" });
    const classified = classify(raw);
    expect(classified).toEqual({ kind: "recovery_required", errorCode: generic });
    const blocked = { ...entry(), exchangeStatus: "processing", canonicalFailureCode: classified.canonicalFailureCode };
    expect(nextOrderedTextExchange([blocked])).toBe(blocked);
  });

  it.each([
    [{ client_message_id: "foreign-client" }, "receipt_client_message_id_mismatch"],
    [{ session_id: "foreign-session" }, "receipt_session_id_mismatch"],
    [{ exchange_id: "foreign-exchange" }, "receipt_exchange_id_mismatch"],
    [{ user_turn_id: 202 }, "receipt_user_turn_id_mismatch"],
    [{ assistant_turn_id: 203 }, "receipt_unexpected_assistant_turn_id"],
  ] as const)("rejects foreign receipt binding %j before durable cause consumption", (changed, expected) => {
    expect(validateReceiptCorrelation(entry(), receipt({ failure_code: "deliberation_unavailable", ...changed }), "recovery_required")).toBe(expected);
  });

  it("accepts the existing nested receipt envelope without modifying the generic code", () => {
    expect(classify({ detail: { ...receipt(), failure_code: "deliberation_unavailable" } })).toEqual({
      kind: "recovery_required", errorCode: generic, canonicalFailureCode: "deliberation_unavailable",
    });
  });

  it("fails closed on conflicting cause fields and preserves malformed data for diagnosis", () => {
    const raw = receipt({ failure_code: "deliberation_unavailable", detail: { failure_code: "expired_worker_lease" } });
    expect(classify(raw)).toEqual({ kind: "terminal_failure", errorCode: "receipt_failure_code_conflict" });
    const malformed = receipt({ detail: { failure_code: 123 } });
    expect(classify(malformed)).toEqual({ kind: "terminal_failure", errorCode: "receipt_failure_code_invalid" });
    expect((malformed.detail as Record<string, unknown>).failure_code).toBe(123);
  });
});

import { describe, expect, it } from "vitest";
import {
  canClaimTextExchange,
  canDeferTextExchange,
  type DurableTextExchange,
  type TextExchangeState,
} from "@/lib/chat/durableExchangeStore";
import { deferredDispatchRevisions, releasesDeferredText } from "@/lib/chat/textOutbox";

// Direct production policy functions on typed input values only: no substitute
// storage, network, backend or runtime. IndexedDB races and APK remain separate
// real-browser/device proof obligations, not claimed by this contract suite.
const queued: DurableTextExchange = {
  schemaVersion: 1, clientMessageId: "policy-contract", timelineKey: "main",
  sessionId: "mobile_kael", bodyHash: "unchanged-body", state: "queued",
  attempts: 1, createdAtMs: 10, updatedAtMs: 20, nextAttemptAtMs: 0,
  requestBody: { text: "contract", session_id: "mobile_kael", client_time: "2026-10-11T00:00:00Z", client_message_id: "policy-contract" },
};

describe("deferred dispatch production policy", () => {
  it("allows local pending or received but not any cognition/terminal receipt", () => {
    expect(canDeferTextExchange(queued)).toBe(true);
    expect(canDeferTextExchange({ ...queued, exchangeStatus: "received" })).toBe(true);
    for (const exchangeStatus of ["processing", "in_progress", "cognition_started", "recovery_required", "complete", "silence", "failed_retryable", "unknown"]) {
      expect(canDeferTextExchange({ ...queued, exchangeStatus })).toBe(false);
    }
  });

  it.each<TextExchangeState>(["sending", "in_progress", "server_committed", "recovery_required", "authentication_required", "terminal_failed", "queued_by_user"])(
    "cannot turn %s into a user defer", (state) => {
      expect(canDeferTextExchange({ ...queued, state })).toBe(false);
    },
  );

  it("gates explicit user defer even when claim has no snapshot", () => {
    const deferred: DurableTextExchange = { ...queued, state: "queued_by_user", updatedAtMs: 21 };
    expect(canClaimTextExchange(deferred)).toBe(false);
    expect(canClaimTextExchange(deferred, { snapshot: deferred })).toBe(false);
    expect(canClaimTextExchange(deferred, { snapshot: deferred, deferredRevision: 21 })).toBe(true);
    expect(canClaimTextExchange(deferred, { snapshot: deferred, deferredRevision: 20 })).toBe(false);
  });

  it("rejects stale queued reader after a defer wins the write transaction", () => {
    expect(canClaimTextExchange({ ...queued, state: "queued_by_user", updatedAtMs: 21 }, { snapshot: queued })).toBe(false);
    // Conversely, once dispatch wins, manual defer cannot reclassify it.
    expect(canDeferTextExchange({ ...queued, state: "sending" })).toBe(false);
  });

  it("never releases a legacy deferred row with an acknowledged cognition receipt", () => {
    for (const exchangeStatus of ["processing", "recovery_required", "complete", "failed_retryable"]) {
      const legacy: DurableTextExchange = { ...queued, state: "queued_by_user", exchangeStatus };
      expect(canClaimTextExchange(legacy, { snapshot: legacy, deferredRevision: legacy.updatedAtMs })).toBe(false);
    }
  });

  it("rejects concurrent mutation, attempt or payload changes before claim", () => {
    expect(canClaimTextExchange(queued, { snapshot: queued })).toBe(true);
    expect(canClaimTextExchange({ ...queued, attempts: 2 }, { snapshot: queued })).toBe(false);
    expect(canClaimTextExchange({ ...queued, updatedAtMs: 21 }, { snapshot: queued })).toBe(false);
    expect(canClaimTextExchange({ ...queued, bodyHash: "different" }, { snapshot: queued })).toBe(false);
  });

  it.each<TextExchangeState>(["authentication_required", "recovery_required", "terminal_failed"])(
    "cannot bypass %s with resume consent", (state) => {
      const entry = { ...queued, state };
      expect(canClaimTextExchange(entry, { snapshot: entry, deferredRevision: entry.updatedAtMs })).toBe(false);
    },
  );

  it("automatic dispatch never releases explicit defer", () => {
    expect(releasesDeferredText()).toBe(false);
    expect(deferredDispatchRevisions([{ ...queued, state: "queued_by_user" }], "automatic", 30).size).toBe(0);
  });

  it.each(["reconnect", "resume", "explicit_retry"] as const)("%s only grants already-deferred revisions", (trigger) => {
    const deferred: DurableTextExchange = { ...queued, state: "queued_by_user" };
    expect([...deferredDispatchRevisions([deferred], trigger, 30)]).toEqual([[queued.clientMessageId, 20]]);
    expect(deferredDispatchRevisions([queued], trigger, 30).size).toBe(0);
    expect(deferredDispatchRevisions([deferred], trigger, 20).size).toBe(0);
    expect(deferredDispatchRevisions([deferred], trigger, 19).size).toBe(0);
  });

  it("an old signal cannot release a later defer of the same UUID", () => {
    const oldEntry: DurableTextExchange = { ...queued, state: "queued_by_user" };
    const grants = deferredDispatchRevisions([oldEntry], "resume", 30);
    const current = { ...oldEntry, updatedAtMs: 40 };
    expect(canClaimTextExchange(current, { snapshot: current, deferredRevision: grants.get(current.clientMessageId) })).toBe(false);
  });
});

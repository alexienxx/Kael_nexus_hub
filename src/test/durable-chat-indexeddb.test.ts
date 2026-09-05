import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHttpResult } from "@/lib/api/chat";
import {
  MANUAL_OUTBOX_CONFIRMATION,
  commitInboxBatch,
  enqueueTextExchange,
  getTextOutboxSummary,
  getTimelineCursor,
  ingestTimelinePage,
  listTextExchanges,
  listTimelineMessages,
  removeTextExchangeManually,
  retryTextExchangeManually,
  stageInboxBatch,
} from "@/lib/chat/durableExchangeStore";
import {
  drainTextOutbox,
  type TextOutboxFaultCheckpoint,
} from "@/lib/chat/textOutbox";

const STORE_NAMES = [
  "text_outbox",
  "timeline_inbox_wal",
  "timeline_messages",
  "timeline_meta",
];

function openContinuityDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("kael-chat-continuity", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function clearContinuityDb(): Promise<void> {
  // Let the production module own schema creation; the test never fabricates
  // object stores that could diverge from the WebView contract.
  await listTextExchanges();
  const db = await openContinuityDb();
  const transaction = db.transaction(STORE_NAMES, "readwrite");
  for (const storeName of STORE_NAMES) transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
  db.close();
}

function canonicalReply(
  clientMessageId: string,
  overrides: Record<string, unknown> = {},
): ChatHttpResult {
  return {
    status: 200,
    statusText: "OK",
    body: {
      reply: "risposta canonica",
      session_id: "mobile_kael",
      client_message_id: clientMessageId,
      exchange_id: "exchange-" + clientMessageId,
      exchange_status: "complete",
      outcome_kind: "reply",
      idempotent_replay: false,
      user_turn_id: 101,
      assistant_turn_id: 102,
      ...overrides,
    },
  };
}

async function enqueue(
  clientMessageId: string,
  text = "messaggio durevole",
  now = new Date("2026-09-04T10:00:00.000Z"),
) {
  return enqueueTextExchange({
    timelineKey: "kael-main",
    sessionId: "mobile_kael",
    text,
    clientMessageId,
    now,
  });
}

describe("durable chat IndexedDB contract (diagnostic; not live acceptance)", () => {
  beforeEach(async () => {
    await clearContinuityDb();
    vi.restoreAllMocks();
  });

  it("fails closed on a receipt for another client message and retains the envelope", async () => {
    const id = "10000000-0000-4000-8000-000000000001";
    await enqueue(id);
    const transport = vi.fn().mockResolvedValue(canonicalReply(id, {
      client_message_id: "20000000-0000-4000-8000-000000000002",
    }));

    const result = await drainTextOutbox({ transport });

    expect(result).toEqual([expect.objectContaining({
      clientMessageId: id,
      kind: "terminal_failure",
      errorCode: "receipt_client_message_id_mismatch",
    })]);
    expect(await listTimelineMessages("kael-main")).toEqual([]);
    expect(await listTextExchanges()).toEqual([
      expect.objectContaining({ clientMessageId: id, state: "terminal_failed" }),
    ]);
  });

  it("accepts only the exact session or the explicit mobile_kael-to-default alias", async () => {
    const acceptedId = "10000000-0000-4000-8000-000000000004";
    await enqueue(acceptedId);
    expect((await drainTextOutbox({
      transport: async () => canonicalReply(acceptedId, { session_id: "default" }),
    }))[0].kind).toBe("reply");

    const rejectedId = "10000000-0000-4000-8000-000000000005";
    await enqueue(rejectedId);
    const result = await drainTextOutbox({
      transport: async () => canonicalReply(rejectedId, { session_id: "another-session" }),
    });
    expect(result[0]).toEqual(expect.objectContaining({
      kind: "terminal_failure",
      errorCode: "receipt_session_id_mismatch",
    }));
    expect(await listTextExchanges()).toEqual([
      expect.objectContaining({ clientMessageId: rejectedId, state: "terminal_failed" }),
    ]);
  });

  it("binds the first exchange id and rejects a different exchange id later", async () => {
    const id = "10000000-0000-4000-8000-000000000003";
    await enqueue(id);
    let nowMs = 1_000;
    const transport = vi.fn()
      .mockResolvedValueOnce({
        status: 202,
        statusText: "Accepted",
        body: {
          reply: "",
          session_id: "mobile_kael",
          client_message_id: id,
          exchange_id: "exchange-a",
          exchange_status: "processing",
          outcome_kind: undefined,
          user_turn_id: 101,
          assistant_turn_id: null,
          error: { code: "exchange_in_progress", retryable: true },
        },
      })
      .mockResolvedValueOnce(canonicalReply(id, { exchange_id: "exchange-b" }));

    expect((await drainTextOutbox({ transport, nowMs: () => nowMs }))[0].kind).toBe("in_progress");
    nowMs = 3_000;
    const second = await drainTextOutbox({ transport, nowMs: () => nowMs });

    expect(second[0]).toEqual(expect.objectContaining({
      kind: "terminal_failure",
      errorCode: "receipt_exchange_id_mismatch",
    }));
    expect(await listTextExchanges()).toEqual([
      expect.objectContaining({ exchangeId: "exchange-a", state: "terminal_failed" }),
    ]);
    expect(await listTimelineMessages("kael-main")).toEqual([]);
  });

  it("accepts only positive distinct numeric turn ids", async () => {
    const invalidPairs = [
      [0, 2],
      [1, -2],
      [1, 1],
      ["1", 2],
      [1, "2"],
    ] as const;

    for (let index = 0; index < invalidPairs.length; index += 1) {
      await clearContinuityDb();
      const id = "10000000-0000-4000-8000-00000000010" + index;
      await enqueue(id);
      const [userTurnId, assistantTurnId] = invalidPairs[index];
      await drainTextOutbox({
        transport: async () => canonicalReply(id, {
          user_turn_id: userTurnId,
          assistant_turn_id: assistantTurnId,
        }),
      });
      expect((await listTextExchanges())[0]).toEqual(
        expect.objectContaining({ state: "terminal_failed" }),
      );
      expect(await listTimelineMessages("kael-main")).toEqual([]);
    }
  });

  it("keeps B queued behind recovery-required A until A is explicitly resolved", async () => {
    const a = "10000000-0000-4000-8000-000000000020";
    const b = "10000000-0000-4000-8000-000000000021";
    await enqueue(a, "A", new Date("2026-09-04T10:00:00.000Z"));
    await enqueue(b, "B", new Date("2026-09-04T10:00:00.000Z"));
    const transport = vi.fn(async (body: { client_message_id: string }) => {
      if (body.client_message_id === a) {
        return {
          status: 409,
          statusText: "Conflict",
          body: {
            reply: "",
            session_id: "mobile_kael",
            client_message_id: a,
            exchange_id: "exchange-a",
            exchange_status: "recovery_required",
            outcome_kind: "failure",
            user_turn_id: 101,
            assistant_turn_id: null,
            error: { code: "cognition_outcome_requires_recovery", retryable: false },
          },
        } satisfies ChatHttpResult;
      }
      return canonicalReply(b, {
        exchange_id: "exchange-b",
        user_turn_id: 103,
        assistant_turn_id: 104,
      });
    });

    expect((await drainTextOutbox({ transport }))[0].kind).toBe("recovery_required");
    expect(await drainTextOutbox({ transport })).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await getTextOutboxSummary()).toEqual(expect.objectContaining({
      total: 2,
      blocked: true,
      attention: [expect.objectContaining({ clientMessageId: a })],
    }));

    await expect(removeTextExchangeManually(a, "not-confirmed")).rejects.toThrow(
      "Explicit user confirmation",
    );
    await removeTextExchangeManually(a, MANUAL_OUTBOX_CONFIRMATION);
    const resumed = await drainTextOutbox({ transport });
    expect(resumed[0]).toEqual(expect.objectContaining({ clientMessageId: b, kind: "reply" }));
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("keeps an auth-rejected envelope visible and preserves FIFO until explicit retry", async () => {
    const a = "10000000-0000-4000-8000-000000000025";
    const b = "10000000-0000-4000-8000-000000000026";
    const original = await enqueue(a, "A autenticazione", new Date("2026-09-04T10:00:00.000Z"));
    await enqueue(b, "B resta fermo", new Date("2026-09-04T10:00:00.000Z"));
    let credentialFixed = false;
    const transport = vi.fn(async (body: { client_message_id: string }) => {
      if (!credentialFixed && body.client_message_id === a) {
        return {
          status: 503,
          statusText: "Service Unavailable",
          body: { detail: { code: "api_auth_not_configured", retryable: false } },
        } satisfies ChatHttpResult;
      }
      return canonicalReply(body.client_message_id, {
        user_turn_id: body.client_message_id === a ? 201 : 203,
        assistant_turn_id: body.client_message_id === a ? 202 : 204,
      });
    });

    expect((await drainTextOutbox({ transport }))[0]).toEqual(expect.objectContaining({
      clientMessageId: a,
      kind: "authentication_required",
      errorCode: "api_auth_not_configured",
    }));
    expect(await drainTextOutbox({ transport })).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await listTextExchanges()).toEqual([
      expect.objectContaining({ clientMessageId: a, state: "authentication_required" }),
      expect.objectContaining({ clientMessageId: b, state: "queued" }),
    ]);
    expect(await getTextOutboxSummary()).toEqual(expect.objectContaining({
      blocked: true,
      attention: [expect.objectContaining({ clientMessageId: a, state: "authentication_required" })],
    }));

    credentialFixed = true;
    const retried = await retryTextExchangeManually(a, MANUAL_OUTBOX_CONFIRMATION);
    expect(retried.requestBody).toEqual(original.requestBody);
    expect(retried.bodyHash).toBe(original.bodyHash);
    expect(retried.state).toBe("queued");

    const resumed = await drainTextOutbox({ transport });
    expect(resumed.map((item) => item.clientMessageId)).toEqual([a, b]);
    expect(resumed.every((item) => item.kind === "reply")).toBe(true);
    expect(await listTextExchanges()).toEqual([]);
  });

  it("manual retry preserves the exact envelope and requires confirmation", async () => {
    const id = "10000000-0000-4000-8000-000000000030";
    const original = await enqueue(id);
    await drainTextOutbox({
      transport: async () => canonicalReply(id, { client_message_id: "wrong" }),
    });

    await expect(retryTextExchangeManually(id, "not-confirmed")).rejects.toThrow(
      "Explicit user confirmation",
    );
    const retried = await retryTextExchangeManually(id, MANUAL_OUTBOX_CONFIRMATION);
    expect(retried.requestBody).toEqual(original.requestBody);
    expect(retried.bodyHash).toBe(original.bodyHash);
    expect(retried.clientMessageId).toBe(id);
    expect(retried.state).toBe("queued");
  });

  it("commits canonical WAL pages only when fromCursor equals current cursor", async () => {
    await stageInboxBatch({
      batchId: "gap-page",
      timelineKey: "kael-main",
      fromCursor: 5,
      nextCursor: 6,
      cursorKind: "conversation_turn_id",
      messages: [{ id: 6, sender: "kael", text: "gap" }],
    });
    await expect(commitInboxBatch("gap-page")).rejects.toThrow("not contiguous");
    expect(await getTimelineCursor("kael-main")).toBe(0);

    await ingestTimelinePage({
      batchId: "first-page",
      timelineKey: "kael-main",
      fromCursor: 0,
      nextCursor: 5,
      cursorKind: "conversation_turn_id",
      messages: [{ id: 5, sender: "kael", text: "first" }],
    });
    expect(await getTimelineCursor("kael-main")).toBe(5);
    await commitInboxBatch("gap-page");
    expect(await getTimelineCursor("kael-main")).toBe(6);
  });

  it("detects deterministic WAL id collisions without replacing the staged page", async () => {
    await stageInboxBatch({
      batchId: "same-batch",
      timelineKey: "kael-main",
      fromCursor: 0,
      nextCursor: 1,
      messages: [{ id: 1, sender: "user", text: "original" }],
    });
    await expect(ingestTimelinePage({
      batchId: "same-batch",
      timelineKey: "kael-main",
      fromCursor: 0,
      nextCursor: 1,
      messages: [{ id: 1, sender: "user", text: "collision" }],
    })).rejects.toThrow("identifier collision");

    await commitInboxBatch("same-batch");
    expect(await listTimelineMessages("kael-main")).toEqual([
      expect.objectContaining({ text: "original" }),
    ]);
  });

  it("rejects a different message body for an already committed turn id", async () => {
    await ingestTimelinePage({
      batchId: "snapshot-original",
      timelineKey: "kael-main",
      fromCursor: 0,
      nextCursor: 0,
      cursorKind: "snapshot",
      messages: [{ id: 10, sender: "user", text: "original" }],
    });
    await expect(ingestTimelinePage({
      batchId: "snapshot-collision",
      timelineKey: "kael-main",
      fromCursor: 0,
      nextCursor: 0,
      cursorKind: "snapshot",
      messages: [{ id: 10, sender: "user", text: "collision" }],
    })).rejects.toThrow("identity collision");
    expect(await listTimelineMessages("kael-main")).toEqual([
      expect.objectContaining({ text: "original" }),
    ]);
  });

  it.each<TextOutboxFaultCheckpoint>([
    "after_mark_sending",
    "after_fetch",
    "after_patch_committed",
    "after_wal_commit",
    "before_delete",
  ])("recovers idempotently from the %s crash window", async (checkpoint) => {
    const id = "10000000-0000-4000-8000-000000000040";
    await enqueue(id);
    const bodies: unknown[] = [];
    const transport = vi.fn(async (body) => {
      bodies.push(structuredClone(body));
      return canonicalReply(id);
    });
    let injected = false;

    await expect(drainTextOutbox({
      transport,
      faultInjector: (current) => {
        if (!injected && current === checkpoint) {
          injected = true;
          throw new Error("injected:" + checkpoint);
        }
      },
    })).rejects.toThrow("injected:" + checkpoint);
    expect(await listTextExchanges()).toHaveLength(1);

    const completed = await drainTextOutbox({ transport });
    expect(completed[completed.length - 1]).toEqual(
      expect.objectContaining({ kind: "reply" }),
    );
    expect(await listTextExchanges()).toEqual([]);
    expect(await listTimelineMessages("kael-main")).toHaveLength(2);
    if (bodies.length === 2) expect(bodies[1]).toEqual(bodies[0]);
  });
});

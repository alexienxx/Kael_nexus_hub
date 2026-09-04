import type { QuotedMessagePayload } from "@/lib/api/chat";

/**
 * Local crash-continuity authority for the text-chat transport.
 *
 * PostgreSQL remains the canonical conversation authority.  This IndexedDB
 * database is a bounded client-side write-ahead log: it retains accepted local
 * sends until the backend outcome is reconciled, and it commits received
 * timeline pages together with their cursor.  The app must fail closed when
 * this store is unavailable; sending first and persisting later re-opens the
 * Android process-death window this module exists to close.
 */

export const CHAT_CONTINUITY_DB_NAME = "kael-chat-continuity";
export const CHAT_CONTINUITY_DB_VERSION = 1;
export const CHAT_CONTINUITY_SCHEMA_VERSION = 1;

const OUTBOX_STORE = "text_outbox";
const INBOX_STORE = "timeline_inbox_wal";
const TIMELINE_STORE = "timeline_messages";
const META_STORE = "timeline_meta";
export const MAX_TEXT_OUTBOX_ENTRIES = 100;
const MAX_TIMELINE_MESSAGES = 1_500;
export const MANUAL_OUTBOX_CONFIRMATION = "confirmed_by_user" as const;

export type TimelineCursorKind = "conversation_turn_id" | "snapshot";

export type TextExchangeState =
  | "queued"
  | "sending"
  | "in_progress"
  | "server_committed"
  | "recovery_required"
  | "terminal_failed";

export interface ExactTextChatRequestBody {
  text: string;
  session_id: string;
  client_time: string;
  client_message_id: string;
  quoted_message?: QuotedMessagePayload;
}

export interface DurableTextExchange {
  schemaVersion: 1;
  clientMessageId: string;
  timelineKey: string;
  sessionId: string;
  requestBody: ExactTextChatRequestBody;
  bodyHash: string;
  state: TextExchangeState;
  attempts: number;
  createdAtMs: number;
  updatedAtMs: number;
  nextAttemptAtMs: number;
  exchangeId?: string;
  exchangeStatus?: string;
  outcomeKind?: string;
  userTurnId?: string;
  assistantTurnId?: string;
  errorCode?: string;
}

export interface DurableInboxBatch {
  schemaVersion: 1;
  batchId: string;
  timelineKey: string;
  fromCursor: number;
  nextCursor: number;
  cursorKind: TimelineCursorKind;
  messages: Record<string, unknown>[];
  pageFingerprint: string;
  createdAtMs: number;
}

interface DurableTimelineMessage {
  id: string;
  timelineKey: string;
  messageKey: string;
  raw: Record<string, unknown>;
  timestamp: number;
  turnId: number;
  writtenAtMs: number;
}

interface TimelineMeta {
  key: string;
  cursor: number;
  updatedAtMs: number;
}

export interface CommitInboxResult {
  batchId: string;
  messages: Record<string, unknown>[];
  cursor: number;
}

export interface TextOutboxSummary {
  total: number;
  capacity: number;
  blocked: boolean;
  attention: DurableTextExchange[];
}

export interface TextExchangePatch {
  state?: TextExchangeState;
  nextAttemptAtMs?: number;
  exchangeId?: string;
  exchangeStatus?: string;
  outcomeKind?: string;
  userTurnId?: string;
  assistantTurnId?: string;
  errorCode?: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function requireIndexedDb(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new Error("Durable chat storage is unavailable");
  }
  return indexedDB;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = requireIndexedDb().open(CHAT_CONTINUITY_DB_NAME, CHAT_CONTINUITY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: "clientMessageId" });
        outbox.createIndex("by_created", "createdAtMs", { unique: false });
      }
      if (!db.objectStoreNames.contains(INBOX_STORE)) {
        const inbox = db.createObjectStore(INBOX_STORE, { keyPath: "batchId" });
        inbox.createIndex("by_timeline", "timelineKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(TIMELINE_STORE)) {
        const timeline = db.createObjectStore(TIMELINE_STORE, { keyPath: "id" });
        timeline.createIndex("by_timeline", "timelineKey", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open durable chat storage"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Durable chat storage upgrade is blocked"));
    };
  });

  return databasePromise;
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .filter((key) => objectValue[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key])}`)
    .join(",")}}`;
}

async function sha256(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto is unavailable for durable chat integrity checks");
  }
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function syncFingerprint(value: unknown): string {
  const input = stableJson(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function asPositiveTurnId(value: unknown): number {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : 0;
}

function rawTurnId(raw: Record<string, unknown>): number {
  return asPositiveTurnId(raw.id ?? raw.turn_id ?? raw.backend_turn_id);
}

function rawTimestamp(raw: Record<string, unknown>): number {
  const direct = Number(raw.timestamp ?? raw.ts ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(String(raw.server_created_at ?? raw.created_at ?? ""));
  return Number.isFinite(parsed) ? parsed / 1000 : 0;
}

function rawMessageKey(raw: Record<string, unknown>): string {
  const turnId = rawTurnId(raw);
  if (turnId > 0) return `turn:${turnId}`;
  const role = asString(raw.sender ?? raw.role) ?? "unknown";
  const clientMessageId = asString(raw.client_message_id ?? asRecord(raw.metadata).client_message_id);
  if (clientMessageId) return `${role}:client:${clientMessageId}`;
  return `fallback:${role}:${syncFingerprint(raw)}`;
}

function canonicalRole(raw: Record<string, unknown>): string {
  const value = (asString(raw.role ?? raw.sender) ?? "unknown").toLowerCase();
  if (value === "kael" || value === "assistant") return "assistant";
  if (value === "user") return "user";
  return value;
}

function canonicalText(raw: Record<string, unknown>): string {
  return String(raw.text ?? raw.content ?? "");
}

function sameCanonicalMessage(
  existing: DurableTimelineMessage,
  incoming: DurableTimelineMessage,
): boolean {
  const existingTurnId = rawTurnId(existing.raw);
  const incomingTurnId = rawTurnId(incoming.raw);
  if (existingTurnId > 0 || incomingTurnId > 0) {
    return existingTurnId > 0 &&
      existingTurnId === incomingTurnId &&
      canonicalRole(existing.raw) === canonicalRole(incoming.raw) &&
      canonicalText(existing.raw) === canonicalText(incoming.raw);
  }
  return stableJson(existing.raw) === stableJson(incoming.raw);
}

function cursorMetaKey(timelineKey: string): string {
  return `cursor:${timelineKey}`;
}

function cloneExchange(entry: DurableTextExchange): DurableTextExchange {
  return structuredClone(entry);
}

export async function enqueueTextExchange(input: {
  timelineKey: string;
  sessionId: string;
  text: string;
  quotedMessage?: QuotedMessagePayload | null;
  now?: Date;
  clientMessageId?: string;
}): Promise<DurableTextExchange> {
  const text = input.text.trim();
  if (!text) throw new Error("Cannot enqueue an empty text message");
  const timelineKey = input.timelineKey.trim();
  const sessionId = input.sessionId.trim();
  if (!timelineKey || !sessionId) throw new Error("Chat timeline/session is unavailable");

  const now = input.now ?? new Date();
  const clientMessageId = input.clientMessageId ?? globalThis.crypto?.randomUUID?.();
  if (!clientMessageId) throw new Error("Unable to create a stable client message identifier");

  const requestBody: ExactTextChatRequestBody = {
    text,
    session_id: sessionId,
    client_time: now.toISOString(),
    client_message_id: clientMessageId,
    ...(input.quotedMessage ? { quoted_message: structuredClone(input.quotedMessage) } : {}),
  };
  const bodyHash = await sha256(requestBody);
  const nowMs = now.getTime();
  const entry: DurableTextExchange = {
    schemaVersion: CHAT_CONTINUITY_SCHEMA_VERSION,
    clientMessageId,
    timelineKey,
    sessionId,
    requestBody,
    bodyHash,
    state: "queued",
    attempts: 0,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    nextAttemptAtMs: 0,
  };

  const db = await openDatabase();
  const transaction = db.transaction(OUTBOX_STORE, "readwrite", { durability: "strict" });
  const store = transaction.objectStore(OUTBOX_STORE);
  const count = await requestResult(store.count());
  if (count >= MAX_TEXT_OUTBOX_ENTRIES) {
    transaction.abort();
    throw new Error("Durable chat outbox is full; resolve pending messages before sending more");
  }
  // Millisecond wall-clock timestamps can collide when two UI events enqueue
  // concurrently.  Compute a strictly increasing durable order inside the
  // serialized write transaction so FIFO never falls back to random UUID sort.
  const newestCursor = await requestResult(
    store.index("by_created").openCursor(null, "prev"),
  ) as IDBCursorWithValue | null;
  const previousCreatedAtMs = Number((newestCursor?.value as DurableTextExchange | undefined)?.createdAtMs ?? 0);
  entry.createdAtMs = Math.max(nowMs, previousCreatedAtMs + 1);
  entry.updatedAtMs = entry.createdAtMs;
  store.add(entry);
  await transactionDone(transaction);
  return cloneExchange(entry);
}

export async function verifyTextExchange(entry: DurableTextExchange): Promise<boolean> {
  if (entry.schemaVersion !== CHAT_CONTINUITY_SCHEMA_VERSION) return false;
  if (entry.clientMessageId !== entry.requestBody.client_message_id) return false;
  if (entry.sessionId !== entry.requestBody.session_id) return false;
  return (await sha256(entry.requestBody)) === entry.bodyHash;
}

export async function listTextExchanges(): Promise<DurableTextExchange[]> {
  const db = await openDatabase();
  const transaction = db.transaction(OUTBOX_STORE, "readonly");
  const entries = await requestResult(transaction.objectStore(OUTBOX_STORE).getAll()) as DurableTextExchange[];
  await transactionDone(transaction);
  return entries
    .map(cloneExchange)
    .sort((left, right) => left.createdAtMs - right.createdAtMs || left.clientMessageId.localeCompare(right.clientMessageId));
}

export async function getTextOutboxSummary(): Promise<TextOutboxSummary> {
  const entries = await listTextExchanges();
  const attention = entries.filter((entry) =>
    entry.state === "recovery_required" || entry.state === "terminal_failed"
  );
  return {
    total: entries.length,
    capacity: MAX_TEXT_OUTBOX_ENTRIES,
    blocked: attention.length > 0,
    attention,
  };
}

export async function markTextExchangeSending(clientMessageId: string, nowMs = Date.now()): Promise<DurableTextExchange> {
  const db = await openDatabase();
  const transaction = db.transaction(OUTBOX_STORE, "readwrite", { durability: "strict" });
  const store = transaction.objectStore(OUTBOX_STORE);
  const entry = await requestResult(store.get(clientMessageId)) as DurableTextExchange | undefined;
  if (!entry) {
    transaction.abort();
    throw new Error("Durable chat exchange no longer exists");
  }
  entry.state = "sending";
  entry.attempts = Number(entry.attempts || 0) + 1;
  entry.updatedAtMs = nowMs;
  entry.nextAttemptAtMs = 0;
  store.put(entry);
  await transactionDone(transaction);
  return cloneExchange(entry);
}

export async function patchTextExchange(
  clientMessageId: string,
  patch: TextExchangePatch,
  nowMs = Date.now(),
): Promise<DurableTextExchange> {
  const db = await openDatabase();
  const transaction = db.transaction(OUTBOX_STORE, "readwrite", { durability: "strict" });
  const store = transaction.objectStore(OUTBOX_STORE);
  const entry = await requestResult(store.get(clientMessageId)) as DurableTextExchange | undefined;
  if (!entry) {
    transaction.abort();
    throw new Error("Durable chat exchange no longer exists");
  }
  Object.assign(entry, patch, { updatedAtMs: nowMs });
  store.put(entry);
  await transactionDone(transaction);
  return cloneExchange(entry);
}

export async function deleteTextExchange(clientMessageId: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(OUTBOX_STORE, "readwrite", { durability: "strict" });
  transaction.objectStore(OUTBOX_STORE).delete(clientMessageId);
  await transactionDone(transaction);
}

function requireManualConfirmation(confirmation: string): void {
  if (confirmation !== MANUAL_OUTBOX_CONFIRMATION) {
    throw new Error("Explicit user confirmation is required");
  }
}

/**
 * Requeue the oldest blocked exchange with its original immutable body/UUID.
 * This never creates a new request. A recovery-required receipt is therefore
 * rechecked through the backend idempotency fence instead of rerunning a new
 * cognitive turn.
 */
export async function retryTextExchangeManually(
  clientMessageId: string,
  confirmation: string,
  nowMs = Date.now(),
): Promise<DurableTextExchange> {
  requireManualConfirmation(confirmation);
  const db = await openDatabase();
  const readTransaction = db.transaction(OUTBOX_STORE, "readonly");
  const snapshot = await requestResult(
    readTransaction.objectStore(OUTBOX_STORE).get(clientMessageId),
  ) as DurableTextExchange | undefined;
  await transactionDone(readTransaction);
  if (!snapshot) {
    throw new Error("Durable chat exchange no longer exists");
  }
  if (snapshot.state !== "recovery_required" && snapshot.state !== "terminal_failed") {
    throw new Error("Only a blocked exchange can be retried manually");
  }
  const actualHash = await sha256(snapshot.requestBody);
  if (actualHash !== snapshot.bodyHash) {
    throw new Error("Blocked exchange failed its integrity check");
  }

  const transaction = db.transaction(OUTBOX_STORE, "readwrite", { durability: "strict" });
  const store = transaction.objectStore(OUTBOX_STORE);
  const entry = await requestResult(store.get(clientMessageId)) as DurableTextExchange | undefined;
  if (!entry || entry.updatedAtMs !== snapshot.updatedAtMs || entry.bodyHash !== snapshot.bodyHash) {
    transaction.abort();
    throw new Error("Blocked exchange changed during confirmation");
  }
  entry.state = "queued";
  entry.attempts = 0;
  entry.nextAttemptAtMs = 0;
  entry.updatedAtMs = nowMs;
  delete entry.errorCode;
  store.put(entry);
  await transactionDone(transaction);
  return cloneExchange(entry);
}

/** Remove a blocked local envelope only after an explicit user decision. */
export async function removeTextExchangeManually(
  clientMessageId: string,
  confirmation: string,
): Promise<void> {
  requireManualConfirmation(confirmation);
  const db = await openDatabase();
  const transaction = db.transaction(OUTBOX_STORE, "readwrite", { durability: "strict" });
  const store = transaction.objectStore(OUTBOX_STORE);
  const entry = await requestResult(store.get(clientMessageId)) as DurableTextExchange | undefined;
  if (!entry) {
    transaction.abort();
    throw new Error("Durable chat exchange no longer exists");
  }
  if (entry.state !== "recovery_required" && entry.state !== "terminal_failed") {
    transaction.abort();
    throw new Error("Only a blocked exchange can be removed manually");
  }
  store.delete(clientMessageId);
  await transactionDone(transaction);
}

export async function stageInboxBatch(input: {
  timelineKey: string;
  fromCursor: number;
  nextCursor: number;
  cursorKind?: TimelineCursorKind;
  messages: Record<string, unknown>[];
  batchId?: string;
  nowMs?: number;
}): Promise<DurableInboxBatch> {
  const batchId = input.batchId ?? globalThis.crypto?.randomUUID?.();
  if (!batchId) throw new Error("Unable to create an inbox WAL identifier");
  const timelineKey = input.timelineKey.trim();
  const fromCursor = Number(input.fromCursor);
  const nextCursor = Number(input.nextCursor);
  const cursorKind = input.cursorKind ?? "conversation_turn_id";
  if (!timelineKey) throw new Error("Inbox timeline key is required");
  if (!Number.isSafeInteger(fromCursor) || fromCursor < 0) {
    throw new Error("Inbox from-cursor must be a non-negative integer");
  }
  if (!Number.isSafeInteger(nextCursor) || nextCursor < 0) {
    throw new Error("Inbox next-cursor must be a non-negative integer");
  }
  if (cursorKind !== "conversation_turn_id" && cursorKind !== "snapshot") {
    throw new Error("Unsupported inbox cursor kind");
  }
  if (!Array.isArray(input.messages)) throw new Error("Inbox messages must be an array");
  if (nextCursor < fromCursor) throw new Error("Inbox cursor cannot move backwards");
  if (cursorKind === "snapshot" && nextCursor !== fromCursor) {
    throw new Error("A snapshot batch cannot advance the canonical cursor");
  }
  const page = {
    timelineKey,
    fromCursor,
    nextCursor,
    cursorKind,
    messages: structuredClone(input.messages),
  };
  const batch: DurableInboxBatch = {
    schemaVersion: CHAT_CONTINUITY_SCHEMA_VERSION,
    batchId,
    ...page,
    pageFingerprint: await sha256(page),
    createdAtMs: input.nowMs ?? Date.now(),
  };

  const db = await openDatabase();
  const transaction = db.transaction(INBOX_STORE, "readwrite", { durability: "strict" });
  await requestResult(transaction.objectStore(INBOX_STORE).add(batch));
  await transactionDone(transaction);
  return structuredClone(batch);
}

async function trimTimeline(timelineKey: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(TIMELINE_STORE, "readwrite");
  const index = transaction.objectStore(TIMELINE_STORE).index("by_timeline");
  const rows = await requestResult(index.getAll(IDBKeyRange.only(timelineKey))) as DurableTimelineMessage[];
  if (rows.length > MAX_TIMELINE_MESSAGES) {
    rows.sort((left, right) => left.timestamp - right.timestamp || left.turnId - right.turnId || left.id.localeCompare(right.id));
    for (const row of rows.slice(0, rows.length - MAX_TIMELINE_MESSAGES)) {
      transaction.objectStore(TIMELINE_STORE).delete(row.id);
    }
  }
  await transactionDone(transaction);
}

export async function commitInboxBatch(batchId: string): Promise<CommitInboxResult> {
  const db = await openDatabase();
  const verificationTransaction = db.transaction(INBOX_STORE, "readonly");
  const verifiedBatch = await requestResult(
    verificationTransaction.objectStore(INBOX_STORE).get(batchId),
  ) as DurableInboxBatch | undefined;
  await transactionDone(verificationTransaction);
  if (!verifiedBatch) throw new Error("Inbox WAL batch no longer exists");
  if (verifiedBatch.schemaVersion !== CHAT_CONTINUITY_SCHEMA_VERSION) {
    throw new Error("Unsupported inbox WAL schema");
  }
  const verifiedPage = {
    timelineKey: verifiedBatch.timelineKey,
    fromCursor: verifiedBatch.fromCursor,
    nextCursor: verifiedBatch.nextCursor,
    cursorKind: verifiedBatch.cursorKind,
    messages: verifiedBatch.messages,
  };
  if (
    !verifiedBatch.pageFingerprint ||
    verifiedBatch.pageFingerprint !== await sha256(verifiedPage)
  ) {
    throw new Error("Inbox WAL integrity check failed");
  }

  const transaction = db.transaction(
    [INBOX_STORE, TIMELINE_STORE, META_STORE],
    "readwrite",
    { durability: "strict" },
  );
  const inbox = transaction.objectStore(INBOX_STORE);
  const timeline = transaction.objectStore(TIMELINE_STORE);
  const meta = transaction.objectStore(META_STORE);
  const batch = await requestResult(inbox.get(batchId)) as DurableInboxBatch | undefined;
  if (!batch) {
    transaction.abort();
    throw new Error("Inbox WAL batch no longer exists");
  }
  if (batch.schemaVersion !== CHAT_CONTINUITY_SCHEMA_VERSION) {
    transaction.abort();
    throw new Error("Unsupported inbox WAL schema");
  }
  const currentPage = {
    timelineKey: batch.timelineKey,
    fromCursor: batch.fromCursor,
    nextCursor: batch.nextCursor,
    cursorKind: batch.cursorKind,
    messages: batch.messages,
  };
  if (
    batch.pageFingerprint !== verifiedBatch.pageFingerprint ||
    stableJson(currentPage) !== stableJson(verifiedPage)
  ) {
    transaction.abort();
    throw new Error("Inbox WAL batch changed during verification");
  }

  const metaKey = cursorMetaKey(batch.timelineKey);
  const previous = await requestResult(meta.get(metaKey)) as TimelineMeta | undefined;
  const currentCursor = Number(previous?.cursor || 0);
  if (!Number.isSafeInteger(currentCursor) || currentCursor < 0) {
    transaction.abort();
    throw new Error("Stored timeline cursor is invalid");
  }
  if (batch.cursorKind === "conversation_turn_id" && currentCursor !== batch.fromCursor) {
    transaction.abort();
    throw new Error("Inbox WAL page is not contiguous with the canonical cursor");
  }
  if (batch.cursorKind === "snapshot" && batch.nextCursor !== batch.fromCursor) {
    transaction.abort();
    throw new Error("Snapshot WAL page attempted to advance the canonical cursor");
  }

  const writtenAtMs = Date.now();
  for (const raw of batch.messages) {
    const messageKey = rawMessageKey(raw);
    const row: DurableTimelineMessage = {
      id: `${batch.timelineKey}\u0000${messageKey}`,
      timelineKey: batch.timelineKey,
      messageKey,
      raw: structuredClone(raw),
      timestamp: rawTimestamp(raw),
      turnId: rawTurnId(raw),
      writtenAtMs,
    };
    const existing = await requestResult(timeline.get(row.id)) as DurableTimelineMessage | undefined;
    if (existing && !sameCanonicalMessage(existing, row)) {
      transaction.abort();
      throw new Error("Timeline message identity collision");
    }
    if (!existing) timeline.add(row);
  }

  const cursor = batch.cursorKind === "conversation_turn_id" ? batch.nextCursor : currentCursor;
  meta.put({ key: metaKey, cursor, updatedAtMs: writtenAtMs } satisfies TimelineMeta);
  inbox.delete(batch.batchId);
  await transactionDone(transaction);
  await trimTimeline(batch.timelineKey);
  return { batchId: batch.batchId, messages: structuredClone(batch.messages), cursor };
}

export async function ingestTimelinePage(input: {
  timelineKey: string;
  fromCursor: number;
  nextCursor: number;
  cursorKind?: TimelineCursorKind;
  messages: Record<string, unknown>[];
  batchId?: string;
}): Promise<CommitInboxResult> {
  const batchId = input.batchId ?? globalThis.crypto?.randomUUID?.();
  if (!batchId) throw new Error("Unable to create an inbox WAL identifier");
  let staged: DurableInboxBatch;
  try {
    staged = await stageInboxBatch({ ...input, batchId });
  } catch (error) {
    // A process may die after staging and before committing.  Reusing the
    // deterministic batch id must resume that WAL record, never create a
    // second page or silently skip it.
    if (!(error && typeof error === "object" && "name" in error && error.name === "ConstraintError")) {
      throw error;
    }
    const db = await openDatabase();
    const transaction = db.transaction(INBOX_STORE, "readonly");
    const existing = await requestResult(transaction.objectStore(INBOX_STORE).get(batchId)) as DurableInboxBatch | undefined;
    await transactionDone(transaction);
    const requestedPage = {
      timelineKey: input.timelineKey.trim(),
      fromCursor: Number(input.fromCursor),
      nextCursor: Number(input.nextCursor),
      cursorKind: input.cursorKind ?? "conversation_turn_id",
      messages: structuredClone(input.messages),
    };
    if (
      !existing ||
      existing.pageFingerprint !== await sha256(requestedPage) ||
      stableJson({
        timelineKey: existing.timelineKey,
        fromCursor: existing.fromCursor,
        nextCursor: existing.nextCursor,
        cursorKind: existing.cursorKind,
        messages: existing.messages,
      }) !== stableJson(requestedPage)
    ) {
      throw new Error("Inbox WAL batch identifier collision");
    }
    staged = existing;
  }
  return commitInboxBatch(staged.batchId);
}

export async function recoverInboxBatches(timelineKey: string): Promise<CommitInboxResult[]> {
  const db = await openDatabase();
  const transaction = db.transaction(INBOX_STORE, "readonly");
  const rows = await requestResult(
    transaction.objectStore(INBOX_STORE).index("by_timeline").getAll(IDBKeyRange.only(timelineKey)),
  ) as DurableInboxBatch[];
  await transactionDone(transaction);
  rows.sort((left, right) => left.createdAtMs - right.createdAtMs || left.batchId.localeCompare(right.batchId));

  const results: CommitInboxResult[] = [];
  for (const row of rows) results.push(await commitInboxBatch(row.batchId));
  return results;
}

export async function listTimelineMessages(timelineKey: string): Promise<Record<string, unknown>[]> {
  const db = await openDatabase();
  const transaction = db.transaction(TIMELINE_STORE, "readonly");
  const rows = await requestResult(
    transaction.objectStore(TIMELINE_STORE).index("by_timeline").getAll(IDBKeyRange.only(timelineKey)),
  ) as DurableTimelineMessage[];
  await transactionDone(transaction);
  rows.sort((left, right) => left.timestamp - right.timestamp || left.turnId - right.turnId || left.id.localeCompare(right.id));
  return rows.map((row) => structuredClone(row.raw));
}

export async function getTimelineCursor(timelineKey: string): Promise<number> {
  const db = await openDatabase();
  const transaction = db.transaction(META_STORE, "readonly");
  const row = await requestResult(transaction.objectStore(META_STORE).get(cursorMetaKey(timelineKey))) as TimelineMeta | undefined;
  await transactionDone(transaction);
  const cursor = Number(row?.cursor || 0);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

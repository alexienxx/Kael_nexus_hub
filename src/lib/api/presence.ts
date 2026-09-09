/**
 * K-1.b / Presence Client — APK-side emit of presence signals.
 *
 * Pure transport layer that POSTs `{session_id, app_foreground,
 * user_typing, last_user_activity_ts}` to the backend `POST /presence/state`
 * endpoint (wired backend-side in K-1.a). Three call patterns:
 *
 *   - `sendPresence(...)` — one-shot fire-and-forget.
 *   - `notifyTyping(sessionId, isTyping)` — debounced typing on/off.
 *   - `startHeartbeat(sessionId)` / `stopHeartbeat()` — periodic
 *     foreground heartbeat (~30 s) to keep the backend's
 *     `last_user_activity_ts` fresh.
 *
 * Fail-soft contract
 * ------------------
 *   - Any HTTP failure (network, 5xx, timeout) is swallowed and normally logged
 *     to console.warn. Expected document-unload/background cancellation stays
 *     silent. The transport NEVER throws into UI.
 *   - Backend not configured (empty baseUrl) → silent no-op.
 *   - Empty `sessionId` → silent no-op.
 *
 * NO env reads. NO retry loops. NO localStorage writes. The backend's
 * K-1.c staleness fallback (>5 min silence -> degrade to offline) is
 * the ultimate safety net if heartbeat stops entirely.
 */
import { getApiConfig } from "./client";

const PRESENCE_PATH = "/presence/state";
const PRESENCE_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const TYPING_DEBOUNCE_MS = 500;

export interface PresencePayload {
  app_foreground?: boolean;
  user_typing?: boolean;
  last_user_activity_ts?: number;
}

/** One-shot fire-and-forget POST to /presence/state. Never throws. */
export async function sendPresence(
  sessionId: string,
  payload: PresencePayload,
): Promise<void> {
  const sid = (sessionId || "").trim();
  if (!sid) return;
  const cfg = getApiConfig();
  if (!cfg.baseUrl) return;

  const body = JSON.stringify({ session_id: sid, ...payload });
  const url = `${cfg.baseUrl.replace(/\/$/, "")}${PRESENCE_PATH}`;

  const hasNativeTimeout = typeof AbortSignal.timeout === "function";
  const controller = hasNativeTimeout ? undefined : new AbortController();
  const timer = hasNativeTimeout
    ? undefined
    : setTimeout(() => controller!.abort(), PRESENCE_TIMEOUT_MS);
  const signal = hasNativeTimeout
    ? AbortSignal.timeout(PRESENCE_TIMEOUT_MS)
    : controller!.signal;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { "X-KAEL-KEY": cfg.apiKey } : {}),
      },
      body,
      signal,
      // Presence is deliberately fire-and-forget. Let the small metadata-only
      // request survive a WebView navigation/background transition instead of
      // cancelling it with the document that emitted the final state change.
      keepalive: true,
    });
  } catch (err) {
    const documentIsLeaving =
      payload.app_foreground === false ||
      (typeof document !== "undefined" && document.visibilityState === "hidden");
    if (!documentIsLeaving) {
      console.warn("[K-1.b] sendPresence failed (fail-soft):", err);
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ── Typing debounce ──────────────────────────────────────────────────

let typingTimer: ReturnType<typeof setTimeout> | null = null;
let lastTypingState: boolean | null = null;

/**
 * Debounced typing indicator emit.
 *
 *   - `notifyTyping(sid, true)` — schedules a `user_typing=true` POST
 *     after 500 ms of activity (debounced; resets the timer if called
 *     again before it fires).
 *   - `notifyTyping(sid, false)` — emits `user_typing=false` immediately
 *     (e.g. on send / blur / idle).
 *
 * Idempotent: consecutive identical states do not re-emit.
 */
export function notifyTyping(sessionId: string, isTyping: boolean): void {
  const sid = (sessionId || "").trim();
  if (!sid) return;

  if (isTyping) {
    if (typingTimer !== null) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingTimer = null;
      if (lastTypingState === true) return; // already typing on backend
      lastTypingState = true;
      void sendPresence(sid, { user_typing: true });
    }, TYPING_DEBOUNCE_MS);
  } else {
    if (typingTimer !== null) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    if (lastTypingState === false) return; // already off
    lastTypingState = false;
    void sendPresence(sid, { user_typing: false });
  }
}

// ── Foreground heartbeat ─────────────────────────────────────────────

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic foreground heartbeat for `sessionId`.
 *
 * Emits `{app_foreground: true, last_user_activity_ts: now}` immediately,
 * then every 30 s until `stopHeartbeat()` is called. Calling this while
 * a heartbeat is already running is a no-op (idempotent).
 */
export function startHeartbeat(sessionId: string): void {
  const sid = (sessionId || "").trim();
  if (!sid) return;
  if (heartbeatTimer !== null) return;

  const tick = () => {
    void sendPresence(sid, {
      app_foreground: true,
      last_user_activity_ts: Date.now() / 1000,
    });
  };
  tick(); // immediate first beat
  heartbeatTimer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

/** Stop the periodic foreground heartbeat. Safe to call multiple times. */
export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Convenience: emit an explicit `app_foreground` change. Used by the
 * Capacitor `App.addListener('appStateChange', ...)` hook in App.tsx.
 *
 * On foreground=true: emits POST + starts heartbeat.
 * On foreground=false: emits POST + stops heartbeat + clears typing.
 */
export function emitForegroundChange(
  sessionId: string,
  foreground: boolean,
): void {
  const sid = (sessionId || "").trim();
  if (!sid) return;

  if (foreground) {
    void sendPresence(sid, {
      app_foreground: true,
      last_user_activity_ts: Date.now() / 1000,
    });
    startHeartbeat(sid);
  } else {
    stopHeartbeat();
    // Clear any pending typing debounce so the backend doesn't see a
    // stale typing=true after the user backgrounded the app.
    if (typingTimer !== null) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    lastTypingState = null;
    void sendPresence(sid, {
      app_foreground: false,
      user_typing: false,
    });
  }
}

/** Test helper — resets all internal timers and cached state. */
export function _resetPresenceClientForTest(): void {
  if (typingTimer !== null) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  lastTypingState = null;
}

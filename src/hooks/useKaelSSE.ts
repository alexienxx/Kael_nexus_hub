/**
 * useKaelSSE — Manages an EventSource connection to GET /chat/events.
 *
 * SINGLE SSE system for autonomous messages. No polling. No pending.
 * Backend pushes → EventSource receives → DOM custom events dispatched.
 *
 * Event flow:
 *   Backend sse_notifier.notify_new_message()
 *     → GET /chat/events (SSE stream)
 *       → this hook parses "new_message" events
 *         → dispatches window CustomEvent "kael-new-message" for timeline sync
 *           and "kael-autonomous-message" for autonomous notifications
 *           → Chat.tsx appends message to state
 *           → AppShell KaelSSEBridge shows toast when chat page is not active
 *
 * DOM events dispatched:
 *   - "kael-new-message"        — every persisted turn; triggers timeline sync
 *   - "kael-autonomous-message" — autonomous assistant turns only
 *   - "kael-sse-connected"      — fired on (re)connect so Chat.tsx can
 *                                  catch up on missed messages
 *
 * Reconnection:
 *   On disconnect, the hook obtains a FRESH SSE token (single-use) and
 *   reconnects with exponential backoff (1s → 30s max).
 */

import { useEffect, useRef } from "react";
import { obtainSSEToken, buildSSEUrl } from "@/lib/api/sse";
import { App as CapApp } from "@capacitor/app";
import { emitTelemetry } from "@/lib/telemetry/sseTelemetry";

/** Shape of the SSE new_message event data. */
export interface KaelSSENewMessage {
  turn_id: number;
  role: string;
  source: string;
  preview: string;
  session_id: string;
  ts: number;
}

/**
 * Sources that originate from Kael's autonomous initiative (not user-request).
 * Only these trigger the "kael-autonomous-message" DOM event.
 * K-2 (2026-05-19): aligned with backend sse_notifier._AUTONOMOUS_SOURCES
 */
const AUTONOMOUS_SOURCES = new Set([
  "autonomy_loop",
  "rupture_repair",
  "serenade_engine",
  "initiative_engine",
  "autonomy",        // K-2: backend may emit this source variant
  "arrakis_autonomy", // K-2: backend may emit this source variant
]);

/**
 * Connect to Kael SSE stream when `enabled` is true.
 * Call once at app level (AppShell / BackendConnectionProvider).
 */
export function useKaelSSE(enabled: boolean): void {
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectGenerationRef = useRef(0);
  const backoffRef = useRef(1000);
  const connectSeqRef = useRef(0);
  const enabledRef = useRef(enabled);
  const mountedRef = useRef(true);
  enabledRef.current = enabled;

  useEffect(() => {
    mountedRef.current = true;

    const cleanup = (invalidateSeq: boolean = true) => {
      if (invalidateSeq) {
        // Invalidate any in-flight async connect started before this cleanup.
        connectSeqRef.current += 1;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectGenerationRef.current += 1;
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current || !enabledRef.current) return;
      const delay = Math.min(backoffRef.current, 30_000);
      backoffRef.current = Math.min(delay * 1.5, 30_000);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current && enabledRef.current) connect();
      }, delay);
    };

    async function connect() {
      const seq = ++connectSeqRef.current;
      cleanup(false);
      if (!mountedRef.current || !enabledRef.current) return;

      try {
        const token = await obtainSSEToken();
        if (seq !== connectSeqRef.current) return;
        if (!mountedRef.current || !enabledRef.current) return;

        const url = buildSSEUrl(token);
        const es = new EventSource(url);
        if (seq !== connectSeqRef.current) {
          es.close();
          return;
        }
        esRef.current = es;

        // ── "connected" event from backend (initial handshake OK) ──
        es.addEventListener("connected", () => {
          console.log("[KaelSSE] Stream connected");
          backoffRef.current = 1000; // reset backoff
          window.dispatchEvent(new CustomEvent("kael-sse-connected"));
        });

        // ── "new_message" — autonomous messages from Kael ──
        es.addEventListener("new_message", (evt) => {
          try {
            const data: KaelSSENewMessage = JSON.parse(
              (evt as MessageEvent).data,
            );
            // Every persisted turn advances the canonical timeline. Chat.tsx
            // consumes this generic event idempotently, including events from
            // another client or a response recovered after an interrupted POST.
            window.dispatchEvent(
              new CustomEvent("kael-new-message", { detail: data }),
            );

            // User-facing notifications remain strictly autonomous.
            if (
              data.role === "assistant" &&
              AUTONOMOUS_SOURCES.has(data.source)
            ) {
              window.dispatchEvent(
                new CustomEvent("kael-autonomous-message", { detail: data }),
              );
            }
          } catch (err) {
            console.warn("[KaelSSE] Parse error:", err);
          }
        });

        // ── connection error → reconnect with fresh token ──
        es.onerror = () => {
          console.warn("[KaelSSE] Disconnected, scheduling reconnect");
          es.close();
          esRef.current = null;
          scheduleReconnect();
        };
      } catch (err) {
        console.warn("[KaelSSE] Connect failed:", err);
        scheduleReconnect();
      }
    }

    // ── Force-reconnect when app resumes from background ──
    //
    // FASE 2 (2026-05-05) — zombie-socket fix:
    // The previous gate `!esRef.current` only reconnected when the socket
    // was already closed. But Android frequently freezes the TCP socket on
    // background without closing it: `esRef.current` stays truthy, the
    // browser thinks SSE is alive, no reconnect happens, and any
    // autonomous message generated during background is never delivered
    // (it sits in the backend `_pending_autonomous` buffer added in FASE 1).
    //
    // New behavior: on resume, ALWAYS tear down + reconnect. This forces
    // the `kael-sse-connected` event to fire on success, which Chat.tsx
    // uses to drain pending messages.
    //
    // No enabledRef gate here: health state may not have recovered yet,
    // but connect() will validate independently.
    const forceReconnect = (reason: string) => {
      if (!mountedRef.current || !enabledRef.current) return;
      emitTelemetry("sse.forceReconnect.requested", { reason });

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      const generation = ++reconnectGenerationRef.current;

      reconnectTimerRef.current = setTimeout(() => {
        if (generation !== reconnectGenerationRef.current) return;
        reconnectTimerRef.current = null;
        if (!mountedRef.current || !enabledRef.current) return;
        console.log(`[KaelSSE] resume → force reconnect (${reason})`);
        backoffRef.current = 1000;
        connect();
      }, 300);
    };

    const onVisibilityChange = () => {
      const state = document.visibilityState;
      emitTelemetry("sse.visibilitychange", { state });
      if (state === "visible" && mountedRef.current) {
        forceReconnect("visibilitychange");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Capacitor appStateChange — fires more reliably on Android than visibilitychange
    let capListener: { remove: () => void } | null = null;
    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive && mountedRef.current) {
        forceReconnect("capacitor.appStateChange");
      }
    }).then((h) => { capListener = h; }).catch(() => {});

    if (enabled) {
      connect();
    } else {
      cleanup();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      capListener?.remove();
    };
  }, [enabled]);
}

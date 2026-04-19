import { useState, useEffect, useRef, useCallback } from "react";
import { getNetharionHeartbeat } from "@/lib/api/netharion";
import type { NetharionHeartbeat, NetharionColor } from "@/lib/api/netharion";
import type { NetharionState } from "@/components/common/NetharionButton";

/**
 * Hook that tracks the Netharion presence heartbeat and maps it to the
 * APK NetharionButton state.
 *
 * DATA SOURCES (priority order):
 *   1. SSE observatory snapshot (`kael-observatory-snapshot` CustomEvent)
 *      — the backend now includes `netharion` in every 5s SSE push.
 *        This is the preferred, lowest-latency source.
 *   2. REST polling on GET /cognition/netharion/heartbeat (5s fallback)
 *      — active when backend doesn't push SSE (e.g. no clients connected yet).
 *      — exponential backoff on consecutive errors.
 *
 * BACKEND MAPPING:
 *   heartbeat_color "green"  → NetharionState "idle"     (sistema ok)
 *   heartbeat_color "amber"  → NetharionState "warning"  (attenzione)
 *   heartbeat_color "red"    → NetharionState "alert"    (allarme)
 *
 * GRACEFUL DEGRADATION:
 *   - If backend unreachable → keeps last known state or "idle"
 *   - If heartbeat unavailable (503) → "idle"
 *   - Polling pauses on consecutive errors (exponential backoff)
 *
 * @param pollIntervalMs  Base poll interval (default: 10000ms = 10s — SSE is primary)
 * @param enabled         Set false to pause (default: true)
 */
export function useNetharion(pollIntervalMs: number = 10_000, enabled: boolean = true) {
  const [state, setState] = useState<NetharionState>("idle");
  const [heartbeat, setHeartbeat] = useState<NetharionHeartbeat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consecutiveErrors = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last SSE update to avoid redundant REST polls
  const lastSseTs = useRef<number>(0);

  /** Map backend color to APK state */
  const colorToState = useCallback((color: NetharionColor): NetharionState => {
    switch (color) {
      case "green":  return "idle";
      case "amber":  return "warning";
      case "red":    return "alert";
      default:       return "idle";
    }
  }, []);

  // ── Source 1: SSE observatory push (zero-cost, no extra requests) ──
  useEffect(() => {
    if (!enabled) return;

    const onSnapshot = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const nh = detail?.netharion;
      if (!nh) return;

      const color: NetharionColor = nh.heartbeat_color ?? "green";
      lastSseTs.current = Date.now();

      // Synthesise a minimal NetharionHeartbeat from the SSE payload
      const synthetic: NetharionHeartbeat = {
        heartbeat_color: color,
        detected: nh.detected ?? false,
        intensity: nh.intensity ?? 0,
        resonance_score: nh.resonance ?? 0,
        stability_score: nh.stability ?? 0,
        presence_source_mode: nh.mode ?? "calm",
        ...(nh as any),
      };

      setHeartbeat(synthetic);
      setState(colorToState(color));
      setError(null);
      consecutiveErrors.current = 0;
    };

    window.addEventListener("kael-observatory-snapshot", onSnapshot);
    return () => window.removeEventListener("kael-observatory-snapshot", onSnapshot);
  }, [enabled, colorToState]);

  // ── Source 2: REST polling fallback ──
  const poll = useCallback(async () => {
    // Skip REST poll if SSE updated recently (< 8s ago)
    if (Date.now() - lastSseTs.current < 8_000) return;

    try {
      const hb = await getNetharionHeartbeat();
      setHeartbeat(hb);
      setState(colorToState(hb.heartbeat_color));
      setError(null);
      consecutiveErrors.current = 0;
    } catch (err) {
      consecutiveErrors.current += 1;
      const msg = err instanceof Error ? err.message : "Netharion heartbeat failed";
      setError(msg);
      if (heartbeat === null) {
        setState("idle");
      }
    }
  }, [colorToState, heartbeat]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await poll();
      if (cancelled) return;

      // Exponential backoff on errors: 10s → 20s → 40s → max 60s
      const backoffFactor = Math.min(consecutiveErrors.current, 3);
      const delay = pollIntervalMs * Math.pow(2, backoffFactor);
      const cappedDelay = Math.min(delay, 60_000);

      timerRef.current = setTimeout(tick, cappedDelay);
    };

    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, poll, pollIntervalMs]);

  return {
    /** Current NetharionState for the button ("idle" | "warning" | "alert") */
    state,
    /** Full heartbeat data from backend (or null if never fetched) */
    heartbeat,
    /** Last error message (or null) */
    error,
    /** Force refresh now (REST) */
    refresh: poll,
  };
}

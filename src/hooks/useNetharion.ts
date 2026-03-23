import { useState, useEffect, useRef, useCallback } from "react";
import { getNetharionHeartbeat } from "@/lib/api/netharion";
import type { NetharionHeartbeat, NetharionColor } from "@/lib/api/netharion";
import type { NetharionState } from "@/components/common/NetharionButton";

/**
 * Hook that polls the Netharion presence heartbeat endpoint
 * and maps backend colors to APK NetharionButton states.
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
 * @param pollIntervalMs  Base poll interval (default: 5000ms = 5s)
 * @param enabled         Set false to pause polling (default: true)
 */
export function useNetharion(pollIntervalMs: number = 5000, enabled: boolean = true) {
  const [state, setState] = useState<NetharionState>("idle");
  const [heartbeat, setHeartbeat] = useState<NetharionHeartbeat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consecutiveErrors = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Map backend color to APK state */
  const colorToState = useCallback((color: NetharionColor): NetharionState => {
    switch (color) {
      case "green":  return "idle";
      case "amber":  return "warning";
      case "red":    return "alert";
      default:       return "idle";
    }
  }, []);

  const poll = useCallback(async () => {
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
      // Don't change state on error — keep last known good state
      // Only reset to "idle" if we never had a successful read
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

      // Exponential backoff on errors: 5s → 10s → 20s → max 60s
      const backoffFactor = Math.min(consecutiveErrors.current, 4);
      const delay = pollIntervalMs * Math.pow(2, backoffFactor);
      const cappedDelay = Math.min(delay, 60_000);

      timerRef.current = setTimeout(tick, cappedDelay);
    };

    // Start first poll immediately
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
    /** Force refresh now */
    refresh: poll,
  };
}

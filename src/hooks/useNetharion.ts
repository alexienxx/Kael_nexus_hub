import { useState, useEffect, useRef, useCallback } from "react";
import { getNetharionHeartbeat } from "@/lib/api/netharion";
import type { NetharionHeartbeat, NetharionColor, NetharionMode } from "@/lib/api/netharion";
import type { NetharionState } from "@/components/common/NetharionButton";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isHeartbeatColor(value: unknown): value is NetharionColor {
  return value === "green" || value === "amber" || value === "red";
}

function isHeartbeatMode(value: unknown): value is NetharionMode {
  return value === "calm" || value === "detected" || value === "recognized" || value === "admitted";
}

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
      const detail = (e as CustomEvent<unknown>).detail;
      if (!isRecord(detail) || !isRecord(detail.netharion)) return;
      const nh = detail.netharion;

      const color: NetharionColor = isHeartbeatColor(nh.heartbeat_color)
        ? nh.heartbeat_color
        : "green";
      const defaultMode: NetharionMode =
        color === "red" ? "admitted" : color === "amber" ? "recognized" : "calm";
      const sourceMode =
        nh.presence_source_mode === "external_reception" || nh.mode === "external_reception"
          ? "external_reception"
          : "symbolic_internal";
      lastSseTs.current = Date.now();

      // Project canonical fields first; schema-v1 aliases are compatibility only.
      const synthetic: NetharionHeartbeat = {
        heartbeat_mode: isHeartbeatMode(nh.heartbeat_mode) ? nh.heartbeat_mode : defaultMode,
        heartbeat_color: color,
        pulse_strength: finiteNumber(nh.pulse_strength ?? nh.intensity, 0.20),
        detected: nh.detected === true,
        recognized: nh.recognized === true || color === "amber" || color === "red",
        admitted: nh.admitted === true || color === "red",
        resonance_score: finiteNumber(nh.resonance_score ?? nh.resonance, 0),
        stability_score: finiteNumber(nh.stability_score ?? nh.stability, 0),
        updated_at: finiteNumber(nh.updated_at ?? nh.last_updated_ts, Date.now() / 1_000),
        presence_source_mode: sourceMode,
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

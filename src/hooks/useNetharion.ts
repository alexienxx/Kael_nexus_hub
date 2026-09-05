import { useCallback, useEffect, useRef, useState } from "react";
import { getNetharionHeartbeat } from "@/lib/api/netharion";
import type { NetharionHeartbeat, NetharionColor } from "@/lib/api/netharion";
import type { NetharionState } from "@/components/common/NetharionButton";

/** Map the transitional REST heartbeat color to the existing button state. */
function colorToState(color: NetharionColor): NetharionState {
  switch (color) {
    case "amber":
      return "warning";
    case "red":
      return "alert";
    case "green":
    default:
      return "idle";
  }
}

/**
 * Transitional Netharion read model for P0-A.
 *
 * The retired Observatory SSE projection is deliberately not consumed here.
 * Until P0-B installs the typed external-agent receptor, this hook has exactly
 * one source: GET /cognition/netharion/heartbeat, polled with bounded backoff.
 */
export function useNetharion(
  pollIntervalMs: number = 10_000,
  enabled: boolean = true,
) {
  const [state, setState] = useState<NetharionState>("idle");
  const [heartbeat, setHeartbeat] = useState<NetharionHeartbeat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consecutiveErrors = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const nextHeartbeat = await getNetharionHeartbeat();
      setHeartbeat(nextHeartbeat);
      setState(colorToState(nextHeartbeat.heartbeat_color));
      setError(null);
      consecutiveErrors.current = 0;
    } catch (cause) {
      consecutiveErrors.current += 1;
      setError(cause instanceof Error ? cause.message : "Netharion heartbeat failed");
    }
  }, []);

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

      const backoffFactor = Math.min(consecutiveErrors.current, 3);
      const delay = Math.min(pollIntervalMs * 2 ** backoffFactor, 60_000);
      timerRef.current = setTimeout(tick, delay);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, poll, pollIntervalMs]);

  return {
    state,
    heartbeat,
    error,
    refresh: poll,
  };
}

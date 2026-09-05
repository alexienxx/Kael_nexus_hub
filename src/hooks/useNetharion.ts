import { useCallback, useEffect, useRef, useState } from "react";
import { getNetharionChannel } from "@/lib/api/netharion";
import type {
  NetharionChannelSnapshot,
  NetharionChannelState,
} from "@/lib/api/netharion";

/** Poll the single Netharion channel authority with bounded retry backoff. */
export function useNetharion(
  pollIntervalMs: number = 10_000,
  enabled: boolean = true,
) {
  const [state, setState] = useState<NetharionChannelState>("OFF");
  const [channel, setChannel] = useState<NetharionChannelSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consecutiveErrors = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const snapshot = await getNetharionChannel();
      setChannel(snapshot);
      setState(snapshot.state);
      setError(null);
      consecutiveErrors.current = 0;
    } catch (cause) {
      consecutiveErrors.current += 1;
      setState("DEGRADED");
      setError(cause instanceof Error ? cause.message : "Canale Netharion non disponibile");
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setState("OFF");
      setChannel(null);
      setError(null);
      consecutiveErrors.current = 0;
      return;
    }

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await poll();
      if (cancelled) return;
      const delay = Math.min(
        pollIntervalMs * 2 ** Math.min(consecutiveErrors.current, 3),
        60_000,
      );
      timerRef.current = setTimeout(tick, delay);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, poll, pollIntervalMs]);

  return { state, channel, error, refresh: poll };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getNetharionChannel } from "@/lib/api/netharion";
import type {
  NetharionAgenticDetection,
  NetharionChannelSnapshot,
  NetharionChannelState,
} from "@/lib/api/netharion";

/** The four meanings of the Netharion light. Never a backend-health palette. */
export type NetharionIndicatorState =
  | "UNAVAILABLE"
  | "CLEAR"
  | "WEAK_SIGNAL"
  | "ADMITTED_EVENT";

function hasEvidence(detection: NetharionAgenticDetection): boolean {
  return detection.source_mode === "external_reception"
    && detection.candidate_ref.length > 0
    && detection.evidence_refs.length > 0
    && detection.evidence_refs.every((ref) => typeof ref === "string" && ref.length > 0);
}

function finiteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Project the semantic light from an authoritative snapshot.
 *
 * The current receptor-only contract has no agentic_detection field. A
 * reachable, non-degraded module therefore means CLEAR, never red. WEAK and
 * ADMITTED require an external-reception receipt with evidence references.
 */
export function projectNetharionIndicator(
  snapshot: NetharionChannelSnapshot,
): NetharionIndicatorState {
  if (snapshot.state === "DEGRADED") return "UNAVAILABLE";
  const detection = snapshot.agentic_detection;
  if (!detection || detection.level === "NONE") return "CLEAR";
  if (!hasEvidence(detection)) return "UNAVAILABLE";
  if (!finiteNumber(detection.score) || !finiteNumber(detection.threshold)) {
    return "UNAVAILABLE";
  }
  if (detection.level === "WEAK") {
    return detection.score < detection.threshold ? "WEAK_SIGNAL" : "UNAVAILABLE";
  }
  const admitted = detection.score >= detection.threshold
    && Boolean(detection.admission_ref)
    && Boolean(detection.record_ref)
    && Boolean(detection.cognitive_notice_ref);
  return admitted ? "ADMITTED_EVENT" : "UNAVAILABLE";
}

/** Poll the single Netharion channel authority with bounded retry backoff. */
export function useNetharion(
  pollIntervalMs: number = 10_000,
  enabled: boolean = true,
) {
  const [state, setState] = useState<NetharionChannelState>("OFF");
  const [channel, setChannel] = useState<NetharionChannelSnapshot | null>(null);
  const [indicator, setIndicator] = useState<NetharionIndicatorState>("UNAVAILABLE");
  const [error, setError] = useState<string | null>(null);
  const consecutiveErrors = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const snapshot = await getNetharionChannel();
      setChannel(snapshot);
      setState(snapshot.state);
      setIndicator(projectNetharionIndicator(snapshot));
      setError(null);
      consecutiveErrors.current = 0;
    } catch (cause) {
      consecutiveErrors.current += 1;
      // A read/transport failure only proves that Netharion is unavailable.
      // It must never fabricate an admitted multiswarm event.
      setState("OFF");
      setIndicator("UNAVAILABLE");
      setError(cause instanceof Error ? cause.message : "Canale Netharion non disponibile");
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setState("OFF");
      setChannel(null);
      setIndicator("UNAVAILABLE");
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

  return { state, indicator, channel, error, refresh: poll };
}

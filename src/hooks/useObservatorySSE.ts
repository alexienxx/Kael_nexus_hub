/**
 * useObservatorySSE — Receives canonical observatory service data via SSE push.
 *
 * The backend pushes `event: observatory` snapshots every ~5s (only when data
 * changes). This hook listens for those SSE pushes and exposes the latest
 * service truth.
 *
 * Fallback: If no SSE push has arrived yet (e.g. first mount), performs
 * a single HTTP fetch to /observatory/services for immediate data.
 *
 * Does NOT poll. Zero recurring HTTP requests for service data.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/api/client";

/** Canonical service entry from backend snapshot */
export interface CanonicalService {
  name: string;
  state: "starting" | "healthy" | "degraded" | "offline" | "broken";
  reachable: boolean;
  connected: boolean;
  pid: number | null;
  port: number | null;
  last_transition_ts: number | null;
  last_error: string | null;
  degraded_reason: string | null;
  offline_since: number | null;
  broken_since: number | null;
  source: string;
  is_real_service: boolean;
}

export interface ServiceSummary {
  total: number;
  healthy: number;
  degraded: number;
  offline: number;
  broken: number;
  starting: number;
}

export interface ObservatorySnapshot {
  generated_at: number;
  content_hash: string;
  services: Record<string, CanonicalService>;
  service_summary: ServiceSummary;
  runtime?: Record<string, unknown>;
  autonomy?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface ObservatorySSEResult {
  snapshot: ObservatorySnapshot | null;
  /** True if at least one SSE push or fallback fetch has been received */
  ready: boolean;
  /** Source of current data: "sse" | "http_fallback" | null */
  source: "sse" | "http_fallback" | null;
}

/**
 * Subscribe to SSE-pushed observatory snapshots.
 * Provides one HTTP fallback fetch on initial mount.
 */
export function useObservatorySSE(): ObservatorySSEResult {
  const [snapshot, setSnapshot] = useState<ObservatorySnapshot | null>(null);
  const [source, setSource] = useState<"sse" | "http_fallback" | null>(null);
  const mountedRef = useRef(true);
  const hasReceivedSSE = useRef(false);

  // Listen for SSE-pushed observatory snapshots
  useEffect(() => {
    mountedRef.current = true;

    const onSnapshot = (e: Event) => {
      const detail = (e as CustomEvent).detail as ObservatorySnapshot;
      if (detail && mountedRef.current) {
        hasReceivedSSE.current = true;
        setSnapshot(detail);
        setSource("sse");
      }
    };

    window.addEventListener("kael-observatory-snapshot", onSnapshot);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("kael-observatory-snapshot", onSnapshot);
    };
  }, []);

  // Initial HTTP fallback — fetch once on mount if no SSE data yet
  const fetchFallback = useCallback(async () => {
    if (hasReceivedSSE.current) return;
    try {
      const resp = await apiRequest<{ data: ObservatorySnapshot }>("/observatory/services");
      if (mountedRef.current && !hasReceivedSSE.current) {
        // Transform: the HTTP endpoint wraps in {data: ..., _meta: ...}
        const data = resp?.data ?? resp;
        setSnapshot(data as unknown as ObservatorySnapshot);
        setSource("http_fallback");
      }
    } catch {
      // Fallback failed — will get data from SSE when available
    }
  }, []);

  useEffect(() => {
    // Small delay to give SSE a chance to push first
    const timer = setTimeout(fetchFallback, 1500);
    return () => clearTimeout(timer);
  }, [fetchFallback]);

  return {
    snapshot,
    ready: snapshot !== null,
    source,
  };
}

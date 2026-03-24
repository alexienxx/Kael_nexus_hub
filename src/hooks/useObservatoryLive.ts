/**
 * useObservatoryLive — Real-time observatory polling hook
 *
 * Features:
 * - 3-second polling interval
 * - Pauses when tab/app is in background (Page Visibility API)
 * - Instant refresh on "kael-observatory-refresh" CustomEvent (after chat sent)
 * - Skips re-render if backend content_hash hasn't changed
 * - Manual retry support
 *
 * Replaces useCapability for all Observatory sections.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getApiConfig } from "@/lib/api/client";

export type LiveState =
  | "loading"
  | "unavailable"
  | "error"
  | "empty"
  | "pending"
  | "available";

export interface LiveResult<T = unknown> {
  state: LiveState;
  data: T | null;
  error: string | null;
  retry: () => void;
}

const POLL_INTERVAL = 3000;

export function useObservatoryLive<T>(
  fetcher: () => Promise<T>,
  options: {
    /** If true, feature is known pending */
    isPending?: boolean;
    /** Determine if response data is "empty" */
    isEmpty?: (data: T) => boolean;
  } = {}
): LiveResult<T> {
  const { isPending = false, isEmpty } = options;
  const [state, setState] = useState<LiveState>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const lastHashRef = useRef<string | null>(null);
  const visibleRef = useRef(true);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    if (!mountedRef.current) return;

    if (isPending) {
      setState("pending");
      return;
    }

    const config = getApiConfig();
    if (!config.baseUrl) {
      setState("unavailable");
      setError("Backend non configurato");
      return;
    }

    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current) return;

      // Check content_hash to skip no-change re-renders
      const meta = (result as any)?._meta;
      const newHash = meta?.content_hash;
      if (newHash && newHash === lastHashRef.current && data !== null) {
        // Data unchanged — skip setState to prevent re-render
        return;
      }
      if (newHash) lastHashRef.current = newHash;

      setData(result);
      setError(null);

      if (isEmpty && isEmpty(result)) {
        setState("empty");
      } else {
        setState("available");
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setData(null);

      if (
        err?.message?.includes("Backend URL not configured") ||
        err?.message?.includes("No internet connection") ||
        err?.message?.includes("Request timeout")
      ) {
        setState("unavailable");
        setError(err.message);
      } else if (err?.status === 404 || err?.status === 501) {
        setState("pending");
        setError("Funzionalità non ancora disponibile");
      } else {
        setState("error");
        setError(err?.message || "Errore sconosciuto");
      }
    }
  }, [isPending, isEmpty, data]);

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true;
    execute();

    const interval = setInterval(() => {
      if (visibleRef.current) {
        execute();
      }
    }, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [execute]);

  // Page Visibility API: pause polling in background
  useEffect(() => {
    const onVisibilityChange = () => {
      visibleRef.current = document.visibilityState === "visible";
      // Fetch immediately when coming back to foreground
      if (visibleRef.current) {
        execute();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [execute]);

  // Post-chat instant refresh via CustomEvent
  useEffect(() => {
    const onRefresh = () => {
      execute();
    };
    window.addEventListener("kael-observatory-refresh", onRefresh);
    return () => window.removeEventListener("kael-observatory-refresh", onRefresh);
  }, [execute]);

  return { state, data, error, retry: execute };
}

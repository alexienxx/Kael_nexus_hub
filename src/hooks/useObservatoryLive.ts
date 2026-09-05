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

interface ObservatoryMeta {
  content_hash?: string;
  updated_at?: unknown;
}

function readObservatoryMeta(value: unknown): ObservatoryMeta | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const meta = (value as Record<string, unknown>)._meta;
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return null;
  const record = meta as Record<string, unknown>;
  return {
    content_hash: typeof record.content_hash === "string" ? record.content_hash : undefined,
    updated_at: record.updated_at,
  };
}

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

      // Dedup: skip re-render only if the response carries a content_hash that
      // is endpoint-specific (e.g. the SSE snapshot hash in services/overview).
      // The global observatory_history hash is shared across ALL sections and only
      // changes when weights/emotional update — so using it for overview/memory/
      // decisions would freeze those sections. We only trust endpoint-level hashes
      // that are NOT the global observatory_history hash (those are usually short
      // hex strings). As a safe heuristic: skip dedup if data is already null
      // (first load must always set state) and only deduplicate when both the
      // incoming hash AND the stored hash are non-empty and different sections
      // would share the same hash source (which we can't distinguish here).
      // Simplest correct fix: only skip if updated_at is also unchanged.
      const meta = readObservatoryMeta(result);
      const newHash = meta?.content_hash;
      const newUpdatedAt = meta?.updated_at;
      const lastHash = lastHashRef.current;

      if (
        newHash &&
        newHash === lastHash &&
        data !== null &&
        // Also require updated_at to be identical — prevents false dedup when
        // backend regenerates the same hash with new timestamp (rare but possible)
        newUpdatedAt != null &&
        newUpdatedAt === readObservatoryMeta(data)?.updated_at
      ) {
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
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setData(null);
      const failure =
        typeof err === "object" && err !== null
          ? (err as { message?: unknown; status?: unknown })
          : {};
      const message =
        typeof failure.message === "string" ? failure.message : "Errore sconosciuto";

      if (
        message.includes("Backend URL not configured") ||
        message.includes("No internet connection") ||
        message.includes("Request timeout")
      ) {
        setState("unavailable");
        setError(message);
      } else if (failure.status === 404 || failure.status === 501) {
        setState("pending");
        setError("Funzionalità non ancora disponibile");
      } else {
        setState("error");
        setError(message);
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

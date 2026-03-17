import { useState, useEffect, useCallback, useRef } from "react";
import { checkHealth, getApiConfig } from "@/lib/api/client";

/**
 * CAPABILITY-TRUTH SYSTEM
 *
 * Centralized layer for determining what backend capabilities are available.
 * Pages use this to render truthful UI states instead of scattered ad-hoc checks.
 *
 * States a feature surface can be in:
 * - "loading"       → checking backend availability
 * - "unavailable"   → backend not configured or unreachable
 * - "error"         → backend reachable but endpoint returned error
 * - "empty"         → backend returned successfully but no data
 * - "pending"       → feature not yet implemented on backend
 * - "available"     → feature live and data present
 */

export type CapabilityState =
  | "loading"
  | "unavailable"
  | "error"
  | "empty"
  | "pending"
  | "available";

export interface CapabilityResult<T = unknown> {
  state: CapabilityState;
  data: T | null;
  error: string | null;
  retry: () => void;
}

/**
 * Hook to check a specific backend capability by fetching data.
 * Automatically determines the correct CapabilityState.
 */
export function useCapability<T>(
  fetcher: () => Promise<T>,
  options: {
    /** If true, the feature is known to not be live yet on backend */
    isPending?: boolean;
    /** Function to determine if the response data is "empty" */
    isEmpty?: (data: T) => boolean;
    /** Whether to auto-fetch on mount. Default true */
    autoFetch?: boolean;
  } = {}
): CapabilityResult<T> {
  const { isPending = false, isEmpty, autoFetch = true } = options;
  const [state, setState] = useState<CapabilityState>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const execute = useCallback(async () => {
    // If feature is marked as pending, don't even try
    if (isPending) {
      setState("pending");
      return;
    }

    // Check if backend is configured
    const config = getApiConfig();
    if (!config.baseUrl) {
      setState("unavailable");
      setError("Backend non configurato");
      return;
    }

    setState("loading");
    setError(null);

    try {
      const result = await fetcherRef.current();
      setData(result);

      if (isEmpty && isEmpty(result)) {
        setState("empty");
      } else {
        setState("available");
      }
    } catch (err: any) {
      setData(null);

      // Check if it's a connection/network error vs an API error
      if (
        err?.message?.includes("Backend URL not configured") ||
        err?.message?.includes("No internet connection") ||
        err?.message?.includes("Request timeout")
      ) {
        setState("unavailable");
        setError(err.message);
      } else if (err?.status === 404 || err?.status === 501) {
        // Endpoint doesn't exist on backend yet
        setState("pending");
        setError("Funzionalità non ancora disponibile");
      } else {
        setState("error");
        setError(err?.message || "Errore sconosciuto");
      }
    }
  }, [isPending, isEmpty]);

  useEffect(() => {
    if (autoFetch) {
      execute();
    }
  }, [execute, autoFetch]);

  return { state, data, error, retry: execute };
}

/**
 * Hook for backend connection status — used globally
 */
export function useBackendStatus() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [isReachable, setIsReachable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const check = useCallback(async () => {
    const config = getApiConfig();
    const configured = !!config.baseUrl;
    setIsConfigured(configured);

    if (!configured) {
      setIsReachable(false);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    const ok = await checkHealth();
    setIsReachable(ok);
    setIsChecking(false);
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [check]);

  return { isConfigured, isReachable, isChecking, recheck: check };
}

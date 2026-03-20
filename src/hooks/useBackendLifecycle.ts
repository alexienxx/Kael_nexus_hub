/**
 * useBackendLifecycle — orchestrates backend discovery and auto-start.
 *
 * On mount:
 *   1. Probe main backend (port 8002) via probeAndResolveBackend()
 *   2. If backend healthy → state = "online", done.
 *   3. If backend down → probe sentinel (port 8099)
 *   4. If sentinel reachable → POST /start → state = "starting"
 *   5. Poll /health until backend is alive or timeout → "online" | "start_failed"
 *   6. If sentinel unreachable → state = "offline" (remote machine or sentinel not running)
 *
 * Guarantees:
 *   - Only ONE bootstrap attempt per mount (no infinite loops)
 *   - UI stays responsive (all async, no blocking)
 *   - Exposes lifecycle state for ConnectionBadge / KaelHeader
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { checkHealth, probeAndResolveBackend, getApiConfig } from "@/lib/api/client";
import { probeSentinel, requestBootstrap } from "@/lib/api/sentinel";

export type BackendLifecycleState =
  | "checking"       // Initial health probe in progress
  | "online"         // Backend healthy and reachable
  | "starting"       // Sentinel triggered bootstrap, waiting
  | "waiting"        // Bootstrap launched, polling for health
  | "start_failed"   // Bootstrap timed out or failed
  | "offline";       // No backend, no sentinel (remote or sentinel not installed)

/** How long to wait after sentinel triggers bootstrap before giving up. */
const STARTUP_TIMEOUT_MS = 120_000; // 2 minutes
/** Interval between health polls after bootstrap trigger. */
const POLL_INTERVAL_MS = 3_000; // 3 seconds
/** Periodic health re-check when online. */
const ONLINE_RECHECK_MS = 30_000; // 30 seconds

export interface BackendLifecycleResult {
  /** Current lifecycle state. */
  state: BackendLifecycleState;
  /** Human-readable status message. */
  message: string;
  /** Force a retry (re-runs the full flow). */
  retry: () => void;
}

export function useBackendLifecycle(): BackendLifecycleResult {
  const [state, setState] = useState<BackendLifecycleState>("checking");
  const [message, setMessage] = useState("Connessione in corso...");
  const mountedRef = useRef(true);
  const attemptedRef = useRef(false);
  const onlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runLifecycle = useCallback(async () => {
    if (!mountedRef.current) return;

    attemptedRef.current = true;
    setState("checking");
    setMessage("Verifica backend...");

    // Step 1: Try to find the main backend
    const backendUrl = await probeAndResolveBackend();
    if (!mountedRef.current) return;

    if (backendUrl) {
      // Backend is already up
      setState("online");
      setMessage("Online");
      startOnlineRecheck();
      return;
    }

    // Step 2: Backend is down — try sentinel
    setMessage("Backend non raggiungibile, ricerca sentinel...");
    const sentinelUrl = await probeSentinel();
    if (!mountedRef.current) return;

    if (!sentinelUrl) {
      // No sentinel available — remote machine or sentinel not running
      setState("offline");
      setMessage("Backend non disponibile");
      return;
    }

    // Step 3: Sentinel found — request bootstrap
    setState("starting");
    setMessage("Server in avvio...");

    try {
      const result = await requestBootstrap(sentinelUrl);
      if (!mountedRef.current) return;

      if (!result.started && result.reason === "backend_already_running") {
        // Race condition: backend came up between our check and sentinel call
        // Re-probe to get the URL cached
        await probeAndResolveBackend();
        setState("online");
        setMessage("Online");
        startOnlineRecheck();
        return;
      }

      if (!result.started && result.reason === "bootstrap_already_in_progress") {
        // Another client already triggered start — just wait
        setState("waiting");
        setMessage("Avvio già in corso, attesa...");
      } else if (!result.started) {
        setState("start_failed");
        setMessage(`Avvio fallito: ${result.reason || "errore sconosciuto"}`);
        return;
      } else {
        setState("waiting");
        setMessage("Preflight cleanup in corso...");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setState("start_failed");
      setMessage("Impossibile contattare il sentinel");
      return;
    }

    // Step 4: Poll health until backend is alive or timeout
    const startTime = Date.now();

    const poll = async (): Promise<void> => {
      while (mountedRef.current && Date.now() - startTime < STARTUP_TIMEOUT_MS) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        setMessage(`Server in avvio... (${elapsed}s)`);

        // Also re-probe to cache the URL
        const url = await probeAndResolveBackend();
        if (url) {
          setState("online");
          setMessage("Online");
          startOnlineRecheck();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // Timeout
      if (mountedRef.current) {
        setState("start_failed");
        setMessage("Timeout avvio server");
      }
    };

    await poll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startOnlineRecheck = useCallback(() => {
    // Clear any existing timer
    if (onlineTimerRef.current) {
      clearInterval(onlineTimerRef.current);
    }
    onlineTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const ok = await checkHealth();
      if (!ok && mountedRef.current) {
        setState("offline");
        setMessage("Connessione persa");
        if (onlineTimerRef.current) {
          clearInterval(onlineTimerRef.current);
          onlineTimerRef.current = null;
        }
      }
    }, ONLINE_RECHECK_MS);
  }, []);

  const retry = useCallback(() => {
    attemptedRef.current = false;
    if (onlineTimerRef.current) {
      clearInterval(onlineTimerRef.current);
      onlineTimerRef.current = null;
    }
    runLifecycle();
  }, [runLifecycle]);

  useEffect(() => {
    mountedRef.current = true;
    runLifecycle();

    return () => {
      mountedRef.current = false;
      if (onlineTimerRef.current) {
        clearInterval(onlineTimerRef.current);
        onlineTimerRef.current = null;
      }
    };
  }, [runLifecycle]);

  return { state, message, retry };
}

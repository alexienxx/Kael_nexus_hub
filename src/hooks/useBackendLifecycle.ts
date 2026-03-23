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
 *   - Anti-concurrency: runLifecycle() is a no-op if already running
 *   - Health grace period: 2 consecutive failures required before going offline
 *   - visibilityChange: skips retry if probe already in flight
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
/**
 * After task-kill + resume, retry if the last successful check is older than this.
 * Avoids hammering backend if user just briefly backgrounds the app.
 */
const RESUME_STALE_THRESHOLD_MS = 5_000; // 5 seconds
/**
 * Number of consecutive health-check failures required before declaring offline.
 * Grace period prevents a single transient 503 from flipping the indicator.
 */
const HEALTH_FAIL_GRACE = 2;

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
  const lastOnlineAtRef = useRef<number>(0);

  /** Mirrors `state` in a ref so stable callbacks can read the current value. */
  const stateRef = useRef<BackendLifecycleState>("checking");

  /** Concurrency lock — prevents two parallel runLifecycle() calls. */
  const isRunningRef = useRef(false);

  /** Counts consecutive health-check failures (reset on success or retry). */
  const healthFailCountRef = useRef(0);

  /** Thin setState wrapper that also keeps stateRef in sync. */
  const setStateSynced = useCallback((s: BackendLifecycleState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const runLifecycle = useCallback(async () => {
    if (!mountedRef.current) return;
    // Concurrency guard: bail out if a lifecycle run is already in progress.
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    try {
      attemptedRef.current = true;
      setStateSynced("checking");
      setMessage("Verifica backend...");

      // Step 1: Try to find the main backend
      const backendUrl = await probeAndResolveBackend();
      if (!mountedRef.current) return;

      if (backendUrl) {
        // Backend is already up
        setStateSynced("online");
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
        setStateSynced("offline");
        setMessage("Backend non disponibile");
        return;
      }

      // Step 3: Sentinel found — request bootstrap
      setStateSynced("starting");
      setMessage("Server in avvio...");

      try {
        const result = await requestBootstrap(sentinelUrl);
        if (!mountedRef.current) return;

        if (!result.started && result.reason === "backend_already_running") {
          // Race condition: backend came up between our check and sentinel call
          // Re-probe to get the URL cached
          await probeAndResolveBackend();
          setStateSynced("online");
          setMessage("Online");
          startOnlineRecheck();
          return;
        }

        if (!result.started && result.reason === "bootstrap_already_in_progress") {
          // Another client already triggered start — just wait
          setStateSynced("waiting");
          setMessage("Avvio già in corso, attesa...");
        } else if (!result.started) {
          setStateSynced("start_failed");
          setMessage(`Avvio fallito: ${result.reason || "errore sconosciuto"}`);
          return;
        } else {
          setStateSynced("waiting");
          setMessage("Preflight cleanup in corso...");
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setStateSynced("start_failed");
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
            setStateSynced("online");
            setMessage("Online");
            startOnlineRecheck();
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        // Timeout
        if (mountedRef.current) {
          setStateSynced("start_failed");
          setMessage("Timeout avvio server");
        }
      };

      await poll();
    } finally {
      // Always release the concurrency lock, even on exception.
      isRunningRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startOnlineRecheck = useCallback(() => {
    // Record when we last confirmed "online"
    lastOnlineAtRef.current = Date.now();
    healthFailCountRef.current = 0;
    // Clear any existing timer
    if (onlineTimerRef.current) {
      clearInterval(onlineTimerRef.current);
    }
    onlineTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const ok = await checkHealth();
      if (ok) {
        healthFailCountRef.current = 0;
        lastOnlineAtRef.current = Date.now();
      } else {
        healthFailCountRef.current++;
        // Grace period: require HEALTH_FAIL_GRACE consecutive failures before going offline.
        // This prevents a single transient error from flipping the connection indicator.
        if (healthFailCountRef.current >= HEALTH_FAIL_GRACE && mountedRef.current) {
          setStateSynced("offline");
          setMessage("Connessione persa");
          if (onlineTimerRef.current) {
            clearInterval(onlineTimerRef.current);
            onlineTimerRef.current = null;
          }
        }
      }
    }, ONLINE_RECHECK_MS);
  }, [setStateSynced]);

  const retry = useCallback(() => {
    attemptedRef.current = false;
    // Reset concurrency lock and health counters so runLifecycle proceeds.
    isRunningRef.current = false;
    healthFailCountRef.current = 0;
    if (onlineTimerRef.current) {
      clearInterval(onlineTimerRef.current);
      onlineTimerRef.current = null;
    }
    runLifecycle();
  }, [runLifecycle]);

  useEffect(() => {
    mountedRef.current = true;
    runLifecycle();

    // App resume: when Android brings the WebView back to foreground (task-kill → reopen,
    // or background → foreground), document.visibilityState changes to "visible".
    // If the backend was lost or the last-known-online timestamp is stale, re-probe.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !mountedRef.current) return;

      // Skip if a probe is already in flight.
      if (isRunningRef.current) return;

      const staleMs = Date.now() - lastOnlineAtRef.current;
      const isStale = staleMs > RESUME_STALE_THRESHOLD_MS;

      // If last-known state is offline/failed → always retry.
      // If online but stale (suspended > threshold) → retry.
      // If online and fresh → skip (backend is likely fine).
      const currentState = stateRef.current;
      if (currentState === "offline" || currentState === "start_failed" || isStale) {
        retry();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (onlineTimerRef.current) {
        clearInterval(onlineTimerRef.current);
        onlineTimerRef.current = null;
      }
    };
  }, [runLifecycle, retry]);

  return { state, message, retry };
}


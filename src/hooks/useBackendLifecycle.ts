/**
 * useBackendLifecycle — CLIENT-ONLY reconnection to backend.
 *
 * ARCHITECTURAL RULE: This hook NEVER launches bootstrap, sentinel,
 * cleanup, or any server-side process.  It only probes and reconnects.
 * Server restart is a separate action (useServerRestart + Settings UI).
 *
 * On mount / retry:
 *   1. Check navigator.onLine — if device offline → state = "offline_network"
 *   2. Probe backend URLs via probeWithRetry() (robust: 3 attempts per URL, 4s timeout, 2s delay)
 *   3. If backend found → state = "online", start periodic recheck
 *   4. If all probes fail → state = "backend_unreachable"
 *
 * On visibility change (app resume / task-kill reopen):
 *   - If stale or not online → re-probe
 *
 * On navigator "online" event:
 *   - Auto-retry when device regains connectivity
 *
 * Guarantees:
 *   - ZERO sentinel calls, ZERO bootstrap calls, ZERO process kills
 *   - Anti-concurrency: probe is a no-op if already running
 *   - Health grace period: 4 consecutive failures before declaring offline
 *   - UI stays responsive (all async, no blocking)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { checkHealth, probeAndResolveBackend, probeHealthPayload } from "@/lib/api/client";

// Re-export the type from the canonical types module
import type { BackendLifecycleState } from "@/types";
export type { BackendLifecycleState };

export type DisconnectReason =
  | "health_fail_grace_exceeded"
  | "resume_probe_failed"
  | "network_offline"
  | "rediscovery_failed"
  | "manual_disconnect"
  | null;

// ── Constants ────────────────────────────────────────────────────────────

/** Periodic health re-check when online. */
const ONLINE_RECHECK_MS = 45_000; // 45 seconds — backend may be busy with LLM generation

/**
 * After task-kill + resume, retry if the last successful check is older than this.
 * Avoids hammering backend if user just briefly backgrounds the app.
 */
const RESUME_STALE_THRESHOLD_MS = 10_000; // 10 seconds

/**
 * Number of consecutive health-check failures required before declaring offline.
 * 8 failures × 45s interval = 6 minutes of tolerance.
 * Long Kael replies (60-180s) can make the backend temporarily slow to respond
 * to /health — this prevents false-offline during long generations.
 */
const HEALTH_FAIL_GRACE = 8;

/** Cooldown for fast route re-discovery after the first failed health check (ms). */
const FAST_FAILOVER_REDISCOVERY_COOLDOWN_MS = 15_000;

/** Max probe attempts per URL candidate. */
const PROBE_MAX_ATTEMPTS = 3;

/** Timeout per individual probe fetch (ms). */
const PROBE_TIMEOUT_MS = 4_000;

/** Delay between probe retry attempts (ms). */
const PROBE_RETRY_DELAY_MS = 2_000;

/** Warmup delay before probing after app resumes from background (ms).
 * Android needs time to restore DNS/TCP after sleep. */
const RESUME_WARMUP_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeOnceWithTimeout(timeoutMs: number): Promise<string | null> {
  return await Promise.race<string | null>([
    probeAndResolveBackend(),
    new Promise<string | null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

// ── Types ────────────────────────────────────────────────────────────────

export interface BackendLifecycleResult {
  /** Current lifecycle state. */
  state: BackendLifecycleState;
  /** Human-readable status message. */
  message: string;
  /** Current retry attempt (0 when idle, 1..N during active retry). */
  retryAttempt: number;
  /** Total retry attempts configured (constant). */
  retryTotal: number;
  /** Force a retry (re-runs probe flow). Never launches bootstrap. */
  retry: () => void;
  /** Reason for the last disconnect (null if never disconnected). */
  disconnectReason: DisconnectReason;
}

// ── Robust probe with retry ─────────────────────────────────────────────

/**
 * Try to reach the backend with multiple attempts.
 * Uses probeAndResolveBackend internally but wraps it with retries.
 * Returns the resolved URL or null.
 */
async function probeWithRetry(
  attempts: number,
  timeoutMs: number,
  delayMs: number,
  mountedRef: React.MutableRefObject<boolean>,
  onAttempt?: (attempt: number) => void,
  minAttemptDurationMs?: number,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    if (!mountedRef.current) return null;

    const attemptNum = i + 1;
    onAttempt?.(attemptNum);
    console.log(`[KAEL] Reconnect attempt ${attemptNum}/${attempts}`);

    const attemptStart = Date.now();
    const url = await probeOnceWithTimeout(timeoutMs);

    // Ensure minimum visibility per attempt (meaningful for manual retries)
    if (minAttemptDurationMs) {
      const elapsed = Date.now() - attemptStart;
      const remaining = minAttemptDurationMs - elapsed;
      if (remaining > 0) {
        await delay(remaining);
      }
    }

    if (url) {
      console.log(`[KAEL] Reconnect OK on attempt ${attemptNum}: ${url}`);
      return url;
    }

    console.warn(`[KAEL] Reconnect attempt ${attemptNum}/${attempts} FAILED or TIMED OUT`);

    // Not last attempt — wait before retrying
    if (i < attempts - 1) {
      await delay(delayMs);
    }
  }
  console.error(`[KAEL] All ${attempts} reconnect attempts exhausted`);
  return null;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useBackendLifecycle(): BackendLifecycleResult {
  const [state, setState] = useState<BackendLifecycleState>("checking");
  const [message, setMessage] = useState("Connessione in corso...");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const mountedRef = useRef(true);
  const onlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastOnlineAtRef = useRef<number>(0);

  /** Mirrors `state` in a ref so stable callbacks can read the current value. */
  const stateRef = useRef<BackendLifecycleState>("checking");

  /** Concurrency lock — prevents two parallel probes. */
  const isRunningRef = useRef(false);

  /** Reason for the last disconnection — for diagnostics. */
  const disconnectReasonRef = useRef<DisconnectReason>(null);

  /** Counts consecutive health-check failures (reset on success or retry). */
  const healthFailCountRef = useRef(0);

  /** Last known boot_id from the backend — detects silent server restarts. */
  const lastBootIdRef = useRef<string | null>(null);

  /** Throttle timestamp for fast re-discovery path to avoid probe storms. */
  const lastFastRediscoveryAtRef = useRef(0);

  /** Thin setState wrapper that also keeps stateRef in sync. */
  const setStateSynced = useCallback((s: BackendLifecycleState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── Start periodic health recheck (when online) ────────────────────

  const startOnlineRecheck = useCallback(() => {
    lastOnlineAtRef.current = Date.now();
    healthFailCountRef.current = 0;
    if (onlineTimerRef.current) {
      clearInterval(onlineTimerRef.current);
    }
    onlineTimerRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const ok = await checkHealth();
      if (ok) {
        healthFailCountRef.current = 0;
        lastOnlineAtRef.current = Date.now();

        // ── Session integrity: detect silent server restart via boot_id ──
        try {
          const payload = await probeHealthPayload();
          if (payload?.boot_id) {
            const prev = lastBootIdRef.current;
            if (prev && prev !== payload.boot_id) {
              console.warn(
                "[KAEL] Server restarted! boot_id changed: %s → %s",
                prev,
                payload.boot_id,
              );
              window.dispatchEvent(
                new CustomEvent("kael-server-restarted", {
                  detail: { oldBootId: prev, newBootId: payload.boot_id },
                }),
              );
            }
            lastBootIdRef.current = payload.boot_id;
          }
        } catch {
          // boot_id check is best-effort — never block health loop
        }

        // If we were in a degraded state, restore online
        if (stateRef.current !== "online") {
          setStateSynced("online");
          setMessage("Online");
        }
      } else {
        healthFailCountRef.current++;

        // Fast failover path for route switches (WiFi -> Tailscale / adb reverse drop).
        // Trigger a single early re-discovery on first failure, then fall back to grace logic.
        if (healthFailCountRef.current === 1 && navigator.onLine) {
          const nowMs = Date.now();
          if (nowMs - lastFastRediscoveryAtRef.current >= FAST_FAILOVER_REDISCOVERY_COOLDOWN_MS) {
            lastFastRediscoveryAtRef.current = nowMs;
            console.warn("[KAEL] Health first-fail while online — trying fast route re-discovery...");
            const rediscovered = await probeAndResolveBackend();
            if (rediscovered && mountedRef.current) {
              console.log("[KAEL] Fast re-discovery found backend ->", rediscovered);
              healthFailCountRef.current = 0;
              setStateSynced("online");
              setMessage("Riconnesso");
              startOnlineRecheck();
              return;
            }
          }
        }

        // Fast failover: if device is still online but cached URL fails,
        // network topology likely changed (e.g. WiFi dropped, Tailscale VPN
        // still up). Use reduced grace (6 × 45s = 270s) instead of full
        // grace (8 × 45s = 360s) to trigger re-discovery sooner.
        // 270s covers long LLM responses + transient Android adb-reverse hiccups.
        const effectiveGrace = navigator.onLine ? 6 : HEALTH_FAIL_GRACE;

        if (healthFailCountRef.current >= effectiveGrace && mountedRef.current) {
          // Cached URL is stale — try full re-discovery before giving up.
          // Backend may have restarted on a different port, or network
          // changed (LAN → Tailscale VPN).
          console.warn("[KAEL] Health grace exhausted (%d/%d) — running full re-discovery...",
            healthFailCountRef.current, effectiveGrace);
          if (onlineTimerRef.current) {
            clearInterval(onlineTimerRef.current);
            onlineTimerRef.current = null;
          }
          const rediscovered = await probeAndResolveBackend();
          if (rediscovered && mountedRef.current) {
            console.log("[KAEL] Re-discovery found backend →", rediscovered);
            healthFailCountRef.current = 0;
            setStateSynced("online");
            setMessage("Riconnesso");
            startOnlineRecheck(); // restart periodic check with new URL
          } else if (mountedRef.current) {
            disconnectReasonRef.current = "rediscovery_failed";
            console.warn("[KAEL] Disconnect reason: rediscovery_failed (grace=%d, fails=%d)",
              effectiveGrace, healthFailCountRef.current);
            setStateSynced("offline");
            setMessage("Connessione persa");
          }
        }
      }
    }, ONLINE_RECHECK_MS);
  }, [setStateSynced]);

  // ── Main probe flow (NEVER touches sentinel or bootstrap) ──────────

  const runProbe = useCallback(async (manual = false) => {
    if (!mountedRef.current) return;
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    try {
      // Step 0: Check device connectivity
      if (!navigator.onLine) {
        disconnectReasonRef.current = "network_offline";
        console.warn("[KAEL] Disconnect reason: network_offline");
        setStateSynced("offline_network");
        setMessage("Dispositivo offline");
        setRetryAttempt(0);
        return;
      }

      setStateSynced("checking");
      setRetryAttempt(0);
      setMessage(manual ? "Riconnessione..." : "Verifica backend...");

      // Step 1: Robust probe with retries
      const backendUrl = await probeWithRetry(
        PROBE_MAX_ATTEMPTS,
        PROBE_TIMEOUT_MS,
        PROBE_RETRY_DELAY_MS,
        mountedRef,
        // For manual retry: report each attempt so UI shows progress
        manual
          ? (attempt) => {
              setRetryAttempt(attempt);
              setMessage(`Tentativo ${attempt}/${PROBE_MAX_ATTEMPTS}...`);
            }
          : undefined,
        // For manual retry: each attempt visible for at least 1.2s
        manual ? 1200 : undefined,
      );
      if (!mountedRef.current) return;

      setRetryAttempt(0);

      if (backendUrl) {
        setStateSynced("online");
        setMessage(manual ? "Riconnesso" : "Connesso");
        // Capture / compare boot_id for session integrity tracking.
        // This path handles offline→online transitions where the recheck
        // setInterval is no longer running — emit kael-server-restarted here
        // so Chat.tsx reloads history even after a long disconnection.
        try {
          const payload = await probeHealthPayload();
          if (payload?.boot_id) {
            const prev = lastBootIdRef.current;
            if (prev && prev !== payload.boot_id) {
              console.warn(
                "[KAEL] runProbe: server restarted (boot_id changed %s → %s)",
                prev,
                payload.boot_id,
              );
              window.dispatchEvent(
                new CustomEvent("kael-server-restarted", {
                  detail: { oldBootId: prev, newBootId: payload.boot_id },
                }),
              );
            }
            lastBootIdRef.current = payload.boot_id;
          }
        } catch {
          // best-effort — never block reconnect flow
        }
        startOnlineRecheck();
        return;
      }

      // Step 2: All probes exhausted — backend unreachable
      // NOTE: We do NOT call sentinel, do NOT launch bootstrap.
      // The user can manually restart the server from Settings > Avanzate.
      disconnectReasonRef.current = "resume_probe_failed";
      console.warn("[KAEL] Disconnect reason: resume_probe_failed (attempts=%d)", PROBE_MAX_ATTEMPTS);
      setStateSynced("backend_unreachable");
      setMessage(`Backend irraggiungibile dopo ${PROBE_MAX_ATTEMPTS} tentativi`);
    } finally {
      isRunningRef.current = false;
      setRetryAttempt(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOnlineRecheck, setStateSynced]);

  // ── Retry (manual from button or auto from events) ─────────────────

  const retry = useCallback(() => {
    isRunningRef.current = false;
    healthFailCountRef.current = 0;
    if (onlineTimerRef.current) {
      clearInterval(onlineTimerRef.current);
      onlineTimerRef.current = null;
    }
    runProbe(true);
  }, [runProbe]);

  // ── Mount / Unmount / Events ───────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    runProbe();

    // Visibility change: app resume / task-kill reopen
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !mountedRef.current) return;
      if (isRunningRef.current) return;

      const staleMs = Date.now() - lastOnlineAtRef.current;
      const isStale = staleMs > RESUME_STALE_THRESHOLD_MS;

      const currentState = stateRef.current;
      if (
        currentState === "offline" ||
        currentState === "offline_network" ||
        currentState === "backend_unreachable" ||
        currentState === "start_failed" ||
        isStale
      ) {
        // Android needs time to restore network after background
        setTimeout(() => {
          if (mountedRef.current && !isRunningRef.current) retry();
        }, RESUME_WARMUP_MS);
      }
    };

    // Network restored: auto-retry when device comes back online
    const handleOnline = () => {
      if (!mountedRef.current) return;
      if (isRunningRef.current) return;
      const currentState = stateRef.current;
      if (currentState === "offline_network" || currentState === "backend_unreachable" || currentState === "offline") {
        retry();
      }
    };

    // Network topology change (WiFi ↔ cellular/VPN): near-instant failover.
    // When WiFi drops but Tailscale VPN keeps the device "online",
    // navigator "online" event does NOT fire. The NetworkInformation API
    // does fire a "change" event, allowing us to detect the switch and
    // immediately verify/re-discover the backend.
    const conn = (navigator as any).connection as EventTarget | undefined;
    const handleConnectionChange = () => {
      if (!mountedRef.current || isRunningRef.current) return;
      if (stateRef.current !== "online") return;
      console.log("[KAEL] Network type changed — verifying cached backend URL...");
      checkHealth().then((ok) => {
        if (!ok && mountedRef.current && !isRunningRef.current) {
          console.warn("[KAEL] Network changed + cached URL dead → fast re-discovery");
          retry();
        }
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    if (conn) conn.addEventListener("change", handleConnectionChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      if (conn) conn.removeEventListener("change", handleConnectionChange);
      if (onlineTimerRef.current) {
        clearInterval(onlineTimerRef.current);
        onlineTimerRef.current = null;
      }
    };
  }, [runProbe, retry]);

  return { state, message, retryAttempt, retryTotal: PROBE_MAX_ATTEMPTS, retry, disconnectReason: disconnectReasonRef.current };
}


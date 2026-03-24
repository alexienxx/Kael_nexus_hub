/**
 * useServerRestart — Explicit server restart via sentinel.
 *
 * ARCHITECTURAL RULE: This hook is the ONLY path to trigger bootstrap.
 * It is intentionally separate from useBackendLifecycle (which only reconnects).
 *
 * Used ONLY from Settings > Avanzate > "Riavvia Server".
 * Never called automatically by the app, never called from Reconnect button.
 *
 * Flow:
 *   1. User confirms restart from UI (confirmation is caller's responsibility)
 *   2. Probe sentinel (port 8099) — if unreachable → error
 *   3. POST /start to sentinel → triggers bootstrap_kael.py
 *   4. Poll backend /health until alive or timeout (120s)
 *   5. Update state: idle → restarting → success | error
 */

import { useState, useRef, useCallback } from "react";
import { probeAndResolveBackend } from "@/lib/api/client";
import { probeSentinel, requestBootstrap } from "@/lib/api/sentinel";

export type ServerRestartState = "idle" | "restarting" | "success" | "error";

export interface RestartProof {
  oldPid: number | null;
  newPid: number | null;
  pidChanged: boolean;
  newUptime: string;
  newSessionId: string;
}

export interface ServerRestartResult {
  /** Current restart state. */
  state: ServerRestartState;
  /** Human-readable status message. */
  message: string;
  /** Proof of restart (PID change, session ID, uptime). Null until success. */
  proof: RestartProof | null;
  /** Trigger the restart. Caller must confirm with user first. */
  restartServer: () => Promise<void>;
  /** Reset state back to idle. */
  reset: () => void;
}

/** How long to wait after sentinel triggers bootstrap before giving up. */
const RESTART_TIMEOUT_MS = 120_000; // 2 minutes
/** Interval between health polls during restart. */
const RESTART_POLL_MS = 3_000; // 3 seconds

interface HealthSnapshot {
  bootstrap_pid: number | null;
  backend_pid: number | null;
  runtime_session_id: string;
  startup_timestamp: number;
  server_time: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHealthSnapshot(baseUrl: string, timeoutMs: number): Promise<HealthSnapshot | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      bootstrap_pid: typeof data.bootstrap_pid === "number" ? data.bootstrap_pid : null,
      backend_pid: typeof data.backend_pid === "number" ? data.backend_pid : null,
      runtime_session_id: typeof data.runtime_session_id === "string" ? data.runtime_session_id : "",
      startup_timestamp: typeof data.startup_timestamp === "number" ? data.startup_timestamp : 0,
      server_time: typeof data.server_time === "number" ? data.server_time : Date.now() / 1000,
    };
  } catch {
    return null;
  }
}

function buildRestartProof(preState: HealthSnapshot | null, postState: HealthSnapshot): {
  proof: RestartProof;
  confirmed: boolean;
  startedFromDownState: boolean;
} {
  const oldPid = preState?.bootstrap_pid ?? preState?.backend_pid ?? null;
  const newPid = postState.bootstrap_pid ?? postState.backend_pid ?? null;
  const pidChanged = oldPid != null && newPid != null && oldPid !== newPid;
  const sessionChanged = Boolean(
    preState?.runtime_session_id &&
    postState.runtime_session_id &&
    preState.runtime_session_id !== postState.runtime_session_id,
  );
  const startupChanged = Boolean(
    preState?.startup_timestamp &&
    postState.startup_timestamp > preState.startup_timestamp,
  );
  const startedFromDownState = !preState && Boolean(postState.runtime_session_id || newPid || postState.startup_timestamp);
  const uptimeSec = postState.startup_timestamp
    ? Math.max(0, Math.round(postState.server_time - postState.startup_timestamp))
    : 0;

  return {
    proof: {
      oldPid,
      newPid,
      pidChanged,
      newUptime: uptimeSec > 0 ? `${uptimeSec}s` : "0s",
      newSessionId: postState.runtime_session_id,
    },
    confirmed: pidChanged || sessionChanged || startupChanged || startedFromDownState,
    startedFromDownState,
  };
}

export function useServerRestart(): ServerRestartResult {
  const [state, setState] = useState<ServerRestartState>("idle");
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState<RestartProof | null>(null);
  const isRunningRef = useRef(false);

  const restartServer = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setProof(null);

    try {
      setState("restarting");
      let preState: HealthSnapshot | null = null;

      // Step 1: Check if backend is already alive
      setMessage("Verifica stato backend...");
      const preUrl = await probeAndResolveBackend();
      if (preUrl) {
        preState = await fetchHealthSnapshot(preUrl, 3_000);
      }
      console.log("[KAEL] Pre-restart state:", preState);

      // Step 2: Find sentinel to issue restart command
      setMessage("Connessione al servizio di restart...");
      const sentinelUrl = await probeSentinel();
      if (!sentinelUrl) {
        setState("error");
        setMessage(
          "Restart non verificabile: il servizio sentinel (porta 8099) non è attivo.\n" +
          "Avvialo dal PC con: pythonw tools/kael_sentinel.pyw",
        );
        return;
      }
      console.log("[KAEL] Sentinel trovato:", sentinelUrl);

      // Step 3: Request bootstrap restart via sentinel
      setMessage("Invio comando restart...");
      try {
        const result = await requestBootstrap(sentinelUrl);
        console.log("[KAEL] Sentinel response:", result);

        if (!result.started && result.reason === "backend_already_running") {
          setState("error");
          setMessage("Restart non confermato: il sentinel segnala backend già in esecuzione");
          return;
        }

        if (!result.started && result.reason !== "bootstrap_already_in_progress") {
          setState("error");
          setMessage(`Restart fallito: ${result.reason || "errore sconosciuto"}`);
          return;
        }
      } catch (err) {
        setState("error");
        setMessage(`Errore sentinel: ${err instanceof Error ? err.message : "sconosciuto"}`);
        return;
      }

      // Step 4: Poll health until backend is alive or timeout
      const startTime = Date.now();
      setMessage("Server in riavvio...");

      while (Date.now() - startTime < RESTART_TIMEOUT_MS) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        setMessage(`Server in riavvio... (${elapsed}s)`);

        try {
          const url = await probeAndResolveBackend();
          if (url) {
            // Step 5: Capture post-restart state and build proof
            setMessage("Verifica restart...");
            const postState = await fetchHealthSnapshot(url, 5_000);
            if (!postState) {
              await delay(RESTART_POLL_MS);
              continue;
            }

            const { proof: restartProof, confirmed, startedFromDownState } = buildRestartProof(preState, postState);
            setProof(restartProof);
            console.log("[KAEL] Restart proof:", restartProof, "confirmed:", confirmed);

            if (confirmed) {
              setState("success");
              setMessage(
                startedFromDownState
                  ? `Server avviato dal comando restart (PID: ${restartProof.newPid ?? "?"})`
                  : `Restart confermato (PID: ${restartProof.oldPid ?? "?"} → ${restartProof.newPid ?? "?"})`,
              );
              return;
            }
          }
        } catch { /* probe failed, keep polling */ }

        await delay(RESTART_POLL_MS);
      }

      setState("error");
      setMessage("Timeout: backend raggiungibile solo senza prova reale di restart, oppure non risponde dopo 120s");
    } finally {
      isRunningRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setMessage("");
    setProof(null);
  }, []);

  return { state, message, proof, restartServer, reset };
}

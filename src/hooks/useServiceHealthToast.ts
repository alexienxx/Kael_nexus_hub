/**
 * useServiceHealthToast — one-shot /health/deep probe on connect.
 *
 * When the backend transitions to "online", fires a single /health/deep
 * call and shows a Sonner toast for each degraded sub-service
 * (e.g. ComfyUI unreachable → "Generazione immagini non disponibile").
 *
 * Runs ONCE per online transition (not on every recheck).
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api/client";
import type { BackendLifecycleState } from "@/types";

/** Human-readable labels for degraded_reasons from /health/deep */
const DEGRADED_LABELS: Record<string, { title: string; description: string }> = {
  comfyui_unreachable: {
    title: "ComfyUI non avviato",
    description: "Generazione immagini non disponibile — avvia ComfyUI e riprova.",
  },
  ollama_unreachable: {
    title: "Ollama non raggiungibile",
    description: "LLM offline — le risposte non funzioneranno.",
  },
  model_not_loaded: {
    title: "Modello non caricato",
    description: "Il modello LLM non risulta attivo su Ollama.",
  },
  db_unreachable: {
    title: "Database non accessibile",
    description: "Il database memoria non risponde.",
  },
  autonomy_loop_stale: {
    title: "Loop autonomia fermo",
    description: "Il ciclo autonomo non sta tickando — potrebbe essere disabilitato.",
  },
};

interface AutonomyHealthBlock {
  /** Present when backend exposes K-2 structured surface. */
  available?: boolean;
  toast_should_show?: boolean;
  loop_state?: "running" | "stale" | "starting" | "stopped" | "disabled" | "unknown";
  dispatch_suppressed?: boolean;
  suppression_reason?: string;
  enabled?: boolean;
  expected_to_tick?: boolean;
  last_tick_age_ms?: number;
  stale_threshold_ms?: number;
  [key: string]: unknown;
}

interface HealthDeepResponse {
  status: string;
  degraded_reasons: string[];
  autonomy_loop_alive?: boolean | null;
  autonomy_loop_state?: "running" | "stopped" | "starting" | "disabled" | "unknown";
  autonomy_health?: AutonomyHealthBlock;
  comfyui_reachable?: boolean;
  [key: string]: unknown;
}

export function useServiceHealthToast(backendState: BackendLifecycleState) {
  /** Tracks whether we already probed for this online session. */
  const probedRef = useRef(false);

  useEffect(() => {
    if (backendState !== "online") {
      // Reset so we probe again on next reconnect
      probedRef.current = false;
      return;
    }

    if (probedRef.current) return;
    probedRef.current = true;

    // Fire-and-forget async probe
    (async () => {
      try {
        const data = await apiRequest<HealthDeepResponse>("/health/deep", {
          timeout: 5000,
        });

        if (data.degraded_reasons && data.degraded_reasons.length > 0) {
          for (const reason of data.degraded_reasons) {
            // K-2 canonical autonomy guard:
            // Prefer structured autonomy_health.toast_should_show when the
            // backend exposes it (>= K-2 cutover). It already accounts for
            // the K-1 dispatch suppression (user typing/active → no toast).
            // Falls back to legacy autonomy_loop_state guard for older backends.
            if (reason === "autonomy_loop_stale") {
              const ah = data.autonomy_health;
              if (ah && ah.available !== false && typeof ah.toast_should_show === "boolean") {
                if (!ah.toast_should_show) {
                  continue;
                }
              } else {
                const state = data.autonomy_loop_state ?? "unknown";
                const alive = data.autonomy_loop_alive;
                const isStopped = state === "stopped" || alive === false;
                if (!isStopped) {
                  continue;
                }
              }
            }

            const label = DEGRADED_LABELS[reason];
            if (label) {
              toast.warning(label.title, {
                description: label.description,
                duration: 8000,
              });
            } else {
              toast.warning("Servizio degradato", {
                description: reason,
                duration: 6000,
              });
            }
          }
        }
      } catch {
        // /health/deep probe is best-effort — never block the app
      }
    })();
  }, [backendState]);
}

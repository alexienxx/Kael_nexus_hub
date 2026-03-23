import { apiRequest } from "./client";

/**
 * NETHARION PRESENCE HEARTBEAT API
 *
 * Netharion è il sottosistema di presence-awareness di Kael.
 * Il heartbeat indica lo stato di "presenza percepita" tramite
 * segnali interni (EMA neural-stream) o ricezione esterna.
 *
 * VERIFIED BACKEND ENDPOINT:
 * - GET /cognition/netharion/heartbeat → stato corrente
 *
 * Backend color mapping:
 *   "green"  → calm    (resonance < 0.30)
 *   "amber"  → detected/recognized (resonance ≥ 0.50)
 *   "red"    → admitted (resonance ≥ 0.80 + stability ≥ 0.75)
 */

export type NetharionMode = "calm" | "detected" | "recognized" | "admitted";
export type NetharionColor = "green" | "amber" | "red";

export interface NetharionHeartbeat {
  heartbeat_mode: NetharionMode;
  heartbeat_color: NetharionColor;
  pulse_strength: number;       // [0.0, 1.0]
  detected: boolean;
  recognized: boolean;
  admitted: boolean;
  resonance_score: number;      // [0.0, 1.0]
  stability_score: number;      // [0.0, 1.0]
  updated_at: number;           // Unix timestamp
  presence_source_mode: "symbolic_internal" | "external_reception";
}

/** Fetch current Netharion presence heartbeat state */
export async function getNetharionHeartbeat(): Promise<NetharionHeartbeat> {
  return apiRequest<NetharionHeartbeat>("/cognition/netharion/heartbeat");
}

// ---------------------------------------------------------------------------
// Debug / audit log (existing backend endpoint, read-only)
// ---------------------------------------------------------------------------

export interface NetharionAuditEntry {
  ts: number;
  old_mode: string | null;
  new_mode: string | null;
  old_color: string | null;
  new_color: string | null;
  resonance_score: number;
  stability_score: number;
  pulse_strength: number;
  admitted: boolean;
  presence_source_mode: string;
  reason: string;
  thresholds_passed: string[];
  thresholds_failed: string[];
  trace_refs: string[];
  classifier?: Record<string, unknown>;
}

export interface NetharionDebugResponse {
  current: NetharionHeartbeat;
  audit_log: NetharionAuditEntry[];
}

/** Fetch full debug audit trail (existing endpoint, no backend changes) */
export async function getNetharionDebug(): Promise<NetharionDebugResponse> {
  return apiRequest<NetharionDebugResponse>("/cognition/netharion/heartbeat/debug");
}

/**
 * Filter audit entries to only real state transitions:
 * old_color !== new_color OR old_mode !== new_mode.
 * Does NOT rely on `reason` field — it can say "state_unchanged"
 * even when colors actually changed (verified from real logs).
 */
export function filterRealEvents(entries: NetharionAuditEntry[]): NetharionAuditEntry[] {
  return entries.filter((e) => {
    const colorChanged = (e.old_color ?? "") !== (e.new_color ?? "");
    const modeChanged = (e.old_mode ?? "") !== (e.new_mode ?? "");
    return colorChanged || modeChanged;
  });
}

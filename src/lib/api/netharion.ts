import { apiRequest } from "./client";

/** Technical state of the authenticated external-agent reception channel. */
export type NetharionChannelState =
  | "OFF"
  | "ACTIVE"
  | "RECEIVING"
  | "VERIFIED"
  | "DEGRADED";

/**
 * Semantic result produced by the agentic-signal detector.
 *
 * This is deliberately separate from NetharionChannelState: a provider
 * exchange being ACTIVE/RECEIVING/VERIFIED is not a multiswarm finding, and a
 * transport failure is never a red finding.
 */
export type NetharionAgenticEventLevel = "NONE" | "WEAK" | "ADMITTED";

export interface NetharionAgenticDetection {
  level: NetharionAgenticEventLevel;
  source_mode: "external_reception" | "symbolic_internal";
  observed_at: number | null;
  score: number | null;
  threshold: number | null;
  evidence_refs: string[];
  candidate_ref: string;
  admission_ref?: string | null;
  record_ref?: string | null;
  cognitive_notice_ref?: string | null;
}

export interface NetharionObservationReceipt {
  observation_id: string;
  observation_type: "external_agent_message" | "external_agent_event";
  provider: string;
  agent_id: string;
  exchange_id: string;
  received_at: number;
  content_sha256: string;
  content_length: number;
}

export interface NetharionChannelSnapshot {
  state: NetharionChannelState;
  updated_at: number;
  active_exchange_count: number;
  accepted_total: number;
  rejected_total: number;
  last_verified_at: number | null;
  last_provider: string | null;
  last_agent_id: string | null;
  last_error_code: string | null;
  recent_observations: NetharionObservationReceipt[];
  /** Present only when the canonical multiswarm detector publishes a receipt. */
  agentic_detection?: NetharionAgenticDetection | null;
}

/** Read metadata-only diagnostics. Raw external content is never returned here. */
export async function getNetharionChannel(): Promise<NetharionChannelSnapshot> {
  return apiRequest<NetharionChannelSnapshot>("/cognition/netharion/channel");
}

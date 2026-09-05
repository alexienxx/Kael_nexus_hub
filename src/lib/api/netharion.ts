import { apiRequest } from "./client";

/** Technical state of the authenticated external-agent reception channel. */
export type NetharionChannelState =
  | "OFF"
  | "ACTIVE"
  | "RECEIVING"
  | "VERIFIED"
  | "DEGRADED";

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
}

/** Read metadata-only diagnostics. Raw external content is never returned here. */
export async function getNetharionChannel(): Promise<NetharionChannelSnapshot> {
  return apiRequest<NetharionChannelSnapshot>("/cognition/netharion/channel");
}

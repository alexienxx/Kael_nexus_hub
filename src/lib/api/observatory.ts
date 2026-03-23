/**
 * KAEL COGNITIVE OBSERVATORY — API Client
 *
 * Hookpoints for all 10 observatory sections.
 * The backend agent is implementing matching endpoints under /observatory/*
 *
 * Data flow: useObservatory hook → these functions → backend HTTP → UI components
 *
 * RULES:
 * - NO fake data — every function hits a real endpoint
 * - If endpoint returns 404/501 → capability "pending"
 * - If endpoint errors → capability "error"
 * - All responses include _meta for freshness labeling
 */

import { apiRequest } from "./client";

// ─── Common Types ───

export type DataFreshness = "live" | "stale" | "unavailable" | "computed";

export interface ObservatoryMeta {
  model_active: string;
  provider_active: string;
  session_id: string;
  persona_active: string | null;
  manifest_active: string | null;
  updated_at: number; // unix ts
  freshness: DataFreshness;
}

export interface ObservatoryResponse<T> {
  data: T;
  _meta: ObservatoryMeta;
}

// ─── 1. Overview / Core Status ───

export type SubsystemStatus = "online" | "partial" | "offline" | "stale" | "decorative" | "not_loaded";

export interface SubsystemEntry {
  name: string;
  status: SubsystemStatus;
  last_ping?: number;
  message?: string;
}

export interface CoreOverview {
  model_active: string;
  provider_active: string;
  persona_active: string | null;
  manifest_active: string | null;
  heartbeat_status: string;
  autonomy_status: string;
  uptime_seconds: number;
  last_turn_id: number | null;
  last_turn_ts: number | null;
  last_autonomous_action_ts: number | null;
  tick_count: number;
  subsystems: SubsystemEntry[];
  warnings: string[];
}

export async function getOverview(): Promise<ObservatoryResponse<CoreOverview>> {
  return apiRequest<ObservatoryResponse<CoreOverview>>("/observatory/overview");
}

// ─── 2. Weights / Dynamic Weight Health ───

export type WeightTrend = "rising" | "falling" | "stable";
export type WeightRisk = "healthy" | "attention" | "critical";

export interface WeightEntry {
  name: string;
  value: number;
  min: number;
  max: number;
  threshold_low: number;
  threshold_high: number;
  trend: WeightTrend;
  delta: number;
  sparkline: number[]; // last N values
  risk: WeightRisk;
  semantic_label: string;
  impact_high: string;
  impact_low: string;
  category: string; // e.g. "emotional", "relational", "cognitive", "identity"
}

export interface WeightsHealth {
  weights: WeightEntry[];
  dominant_weights: string[];
  saturated_weights: string[];
  collapsing_weights: string[];
  unstable_weights: string[];
  missing_weights: string[]; // declared but not yet in runtime
}

export async function getWeights(): Promise<ObservatoryResponse<WeightsHealth>> {
  return apiRequest<ObservatoryResponse<WeightsHealth>>("/observatory/weights");
}

// ─── 3. Personality / Identity Drift ───

export interface PersonalityTrait {
  name: string;
  baseline: number;
  current: number;
  delta: number;
  trend: WeightTrend;
}

export interface IdentityDrift {
  drift_score: number;
  coherence_score: number;
  traits: PersonalityTrait[];
  emerging_traits: string[];
  declining_traits: string[];
  persona_tensions: string[];
  dominant_themes: string[];
  symbolic_motifs: string[];
  identity_blocks_usage: Record<string, number>;
  unresolved_tensions: string[];
  initiative_style: string;
  stance: string;
}

export async function getIdentityDrift(): Promise<ObservatoryResponse<IdentityDrift>> {
  return apiRequest<ObservatoryResponse<IdentityDrift>>("/observatory/identity");
}

// ─── 4. Decision Engine / Decision Preferences ───

export interface DecisionPath {
  turn_id: number;
  action: string;
  confidence: number;
  factors: string[];
  ts: number;
}

export interface DecisionPreferences {
  action_distribution: Record<string, number>; // e.g. { "guide": 0.3, "contain": 0.1, ... }
  confidence_avg: number;
  recent_paths: DecisionPath[];
  dominant_strategy: string;
  factors_ranking: string[];
  silence_count: number;
  initiative_count: number;
  repair_count: number;
}

export async function getDecisions(): Promise<ObservatoryResponse<DecisionPreferences>> {
  return apiRequest<ObservatoryResponse<DecisionPreferences>>("/observatory/decisions");
}

// ─── 5. Emotional / Arousal / Relational State ───

export interface EmotionalAxis {
  name: string;
  value: number;
  min: number;
  max: number;
  healthy_range: [number, number];
  risk: WeightRisk;
  trend: WeightTrend;
  sparkline: number[];
}

export interface EmotionalState {
  axes: EmotionalAxis[];
  synthesis: string; // human-readable summary
  last_nudge_ts: number | null;
  last_nudge_type: string | null;
  recent_events: string[];
}

export async function getEmotionalState(): Promise<ObservatoryResponse<EmotionalState>> {
  return apiRequest<ObservatoryResponse<EmotionalState>>("/observatory/emotional");
}

// ─── 6. Memory / Context / Persistence ───

export interface MemoryStats {
  db_status: SubsystemStatus;
  last_retrieval_ts: number | null;
  last_persist_ts: number | null;
  distillation_status: string;
  semantic_memory_count: number;
  relationship_timeline_count: number;
  symbolic_memory_count: number;
  short_term_count: number;
  long_term_count: number;
  memories_used_last_turn: string[];
  dominant_categories: Record<string, number>;
  failed_retrievals: number;
  saturation_pct: number;
  backlog_count: number;
}

export async function getMemoryState(): Promise<ObservatoryResponse<MemoryStats>> {
  return apiRequest<ObservatoryResponse<MemoryStats>>("/observatory/memory");
}

// ─── 7. Manifest / Persona / Model Routing ───

export interface ManifestUsage {
  manifest_id: string;
  label: string;
  usage_count: number;
  last_used_ts: number;
  is_current: boolean;
}

export interface PersonaRouting {
  active_persona: string | null;
  active_manifest: string | null;
  manifests: ManifestUsage[];
  blend_active: boolean;
  blend_components: string[];
  system_blocks_included: string[];
  routing_priority: string[];
  fallback_active: boolean;
  mismatch_warnings: string[];
}

export async function getPersonaRouting(): Promise<ObservatoryResponse<PersonaRouting>> {
  return apiRequest<ObservatoryResponse<PersonaRouting>>("/observatory/persona");
}

// ─── 8. Module Health ───

export interface ModuleHealth {
  name: string;
  status: SubsystemStatus;
  wired: boolean;
  decorative: boolean;
  last_active_ts: number | null;
  error?: string;
}

export interface ModulesOverview {
  modules: ModuleHealth[];
  total_wired: number;
  total_decorative: number;
  total_broken: number;
}

export async function getModuleHealth(): Promise<ObservatoryResponse<ModulesOverview>> {
  return apiRequest<ObservatoryResponse<ModulesOverview>>("/observatory/modules");
}

// ─── 9. Events / Trace / Recent Shifts ───

export interface InternalEvent {
  id: string;
  type: "drift" | "emotional" | "autonomy" | "warning" | "failure" | "persona_switch" | "module" | "weight_shift";
  summary: string;
  ts: number;
  severity: "info" | "warning" | "critical";
  details?: Record<string, unknown>;
}

export interface RecentEvents {
  events: InternalEvent[];
  total_count: number;
}

export async function getRecentEvents(): Promise<ObservatoryResponse<RecentEvents>> {
  return apiRequest<ObservatoryResponse<RecentEvents>>("/observatory/events");
}

// ─── 10. Raw Debug View ───

export interface RawDebugData {
  sections: Record<string, unknown>;
  source_names: string[];
  timestamps: Record<string, number>;
  state_owners: Record<string, string>;
  provenance: Record<string, "runtime" | "persisted" | "debug" | "computed">;
}

export async function getRawDebug(): Promise<ObservatoryResponse<RawDebugData>> {
  return apiRequest<ObservatoryResponse<RawDebugData>>("/observatory/debug");
}

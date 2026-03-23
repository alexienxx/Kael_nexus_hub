/**
 * Observatory data-fetching hooks.
 * Each section gets its own hook using the capability pattern.
 */

import { useCapability, type CapabilityResult } from "./useCapability";
import * as obs from "@/lib/api/observatory";

export function useOverview(): CapabilityResult<obs.ObservatoryResponse<obs.CoreOverview>> {
  return useCapability(() => obs.getOverview());
}

export function useWeights(): CapabilityResult<obs.ObservatoryResponse<obs.WeightsHealth>> {
  return useCapability(() => obs.getWeights());
}

export function useIdentityDrift(): CapabilityResult<obs.ObservatoryResponse<obs.IdentityDrift>> {
  return useCapability(() => obs.getIdentityDrift());
}

export function useDecisions(): CapabilityResult<obs.ObservatoryResponse<obs.DecisionPreferences>> {
  return useCapability(() => obs.getDecisions());
}

export function useEmotionalState(): CapabilityResult<obs.ObservatoryResponse<obs.EmotionalState>> {
  return useCapability(() => obs.getEmotionalState());
}

export function useMemoryState(): CapabilityResult<obs.ObservatoryResponse<obs.MemoryStats>> {
  return useCapability(() => obs.getMemoryState());
}

export function usePersonaRouting(): CapabilityResult<obs.ObservatoryResponse<obs.PersonaRouting>> {
  return useCapability(() => obs.getPersonaRouting());
}

export function useModuleHealth(): CapabilityResult<obs.ObservatoryResponse<obs.ModulesOverview>> {
  return useCapability(() => obs.getModuleHealth());
}

export function useRecentEvents(): CapabilityResult<obs.ObservatoryResponse<obs.RecentEvents>> {
  return useCapability(() => obs.getRecentEvents());
}

export function useRawDebug(): CapabilityResult<obs.ObservatoryResponse<obs.RawDebugData>> {
  return useCapability(() => obs.getRawDebug());
}

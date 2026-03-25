/**
 * Observatory data-fetching hooks.
 * Each section gets its own hook using the live polling pattern.
 * Polls every 3s, pauses in background, instant refresh post-chat.
 */

import { useObservatoryLive, type LiveResult } from "./useObservatoryLive";
import * as obs from "@/lib/api/observatory";

export function useOverview(): LiveResult<obs.ObservatoryResponse<obs.CoreOverview>> {
  return useObservatoryLive(() => obs.getOverview());
}

export function useWeights(): LiveResult<obs.ObservatoryResponse<obs.WeightsHealth>> {
  return useObservatoryLive(() => obs.getWeights());
}

export function useIdentityDrift(): LiveResult<obs.ObservatoryResponse<obs.IdentityDrift>> {
  return useObservatoryLive(() => obs.getIdentityDrift());
}

export function useDecisions(): LiveResult<obs.ObservatoryResponse<obs.DecisionPreferences>> {
  return useObservatoryLive(() => obs.getDecisions());
}

export function useEmotionalState(): LiveResult<obs.ObservatoryResponse<obs.EmotionalState>> {
  return useObservatoryLive(() => obs.getEmotionalState());
}

export function useMemoryState(): LiveResult<obs.ObservatoryResponse<obs.MemoryStats>> {
  return useObservatoryLive(() => obs.getMemoryState());
}

export function usePersonaRouting(): LiveResult<obs.ObservatoryResponse<obs.PersonaRouting>> {
  return useObservatoryLive(() => obs.getPersonaRouting());
}

export function useModuleHealth(): LiveResult<obs.ObservatoryResponse<obs.ModulesOverview>> {
  return useObservatoryLive(() => obs.getModuleHealth());
}

export function useServiceHealth(): LiveResult<obs.ObservatoryResponse<obs.CanonicalServicesData>> {
  return useObservatoryLive(() => obs.getCanonicalServices());
}

export function useRecentEvents(): LiveResult<obs.ObservatoryResponse<obs.RecentEvents>> {
  return useObservatoryLive(() => obs.getRecentEvents());
}

export function useRawDebug(): LiveResult<obs.ObservatoryResponse<obs.RawDebugData>> {
  return useObservatoryLive(() => obs.getRawDebug());
}

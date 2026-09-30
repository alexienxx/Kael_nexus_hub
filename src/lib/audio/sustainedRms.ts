export interface SustainedRmsObservation {
  aboveThresholdSince: number | null;
  triggered: boolean;
}

/** Track one continuous above-threshold interval without classifying content. */
export function observeSustainedRms(
  aboveThresholdSince: number | null,
  rms: number,
  now: number,
  threshold: number,
  holdMilliseconds: number,
): SustainedRmsObservation {
  if (rms < threshold) {
    return { aboveThresholdSince: null, triggered: false };
  }
  const startedAt = aboveThresholdSince ?? now;
  return {
    aboveThresholdSince: startedAt,
    triggered: now - startedAt >= holdMilliseconds,
  };
}

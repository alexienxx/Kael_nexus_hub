import { describe, expect, it } from "vitest";
import { observeSustainedRms } from "@/lib/audio/sustainedRms";

describe("sustained acoustic barge-in threshold", () => {
  it("requires one continuous interval and resets after a quiet frame", () => {
    let since: number | null = null;

    let observation = observeSustainedRms(since, 0.05, 1_000, 0.04, 180);
    since = observation.aboveThresholdSince;
    expect(observation.triggered).toBe(false);

    observation = observeSustainedRms(since, 0.05, 1_179, 0.04, 180);
    since = observation.aboveThresholdSince;
    expect(observation.triggered).toBe(false);

    observation = observeSustainedRms(since, 0.01, 1_180, 0.04, 180);
    since = observation.aboveThresholdSince;
    expect(observation).toEqual({ aboveThresholdSince: null, triggered: false });

    observation = observeSustainedRms(since, 0.05, 2_000, 0.04, 180);
    since = observation.aboveThresholdSince;
    observation = observeSustainedRms(since, 0.05, 2_180, 0.04, 180);

    expect(observation).toEqual({ aboveThresholdSince: 2_000, triggered: true });
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/netharion", () => ({
  getNetharionChannel: vi.fn(),
}));

import { projectNetharionIndicator, useNetharion } from "@/hooks/useNetharion";
import { getNetharionChannel } from "@/lib/api/netharion";

const mockedChannel = vi.mocked(getNetharionChannel);

describe("Netharion authenticated channel authority", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps the exact receptor state and metadata-only diagnostics", async () => {
    mockedChannel.mockResolvedValue({
      state: "VERIFIED",
      updated_at: 1234,
      active_exchange_count: 0,
      accepted_total: 1,
      rejected_total: 0,
      last_verified_at: 1234,
      last_provider: "openai",
      last_agent_id: "gpt-test",
      last_error_code: null,
      recent_observations: [{
        observation_id: "obs-1",
        observation_type: "external_agent_message",
        provider: "openai",
        agent_id: "gpt-test",
        exchange_id: "exchange-1",
        received_at: 1234,
        content_sha256: "a".repeat(64),
        content_length: 18,
      }],
    });

    const { result, unmount } = renderHook(() => useNetharion(10_000, true));
    await waitFor(() => expect(result.current.state).toBe("VERIFIED"));

    expect(mockedChannel).toHaveBeenCalledTimes(1);
    expect(result.current.indicator).toBe("CLEAR");
    expect(result.current.channel?.recent_observations[0]).not.toHaveProperty("content");
    unmount();
  });

  it("reports OFF and does not poll while the backend is offline", async () => {
    const { result, unmount } = renderHook(() => useNetharion(10_000, false));

    await Promise.resolve();
    expect(mockedChannel).not.toHaveBeenCalled();
    expect(result.current.state).toBe("OFF");
    expect(result.current.indicator).toBe("UNAVAILABLE");
    unmount();
  });

  it("reports gray unavailable, never a red event, after a channel request fails", async () => {
    mockedChannel.mockRejectedValue(new Error("unreachable"));
    const { result, unmount } = renderHook(() => useNetharion(10_000, true));
    await waitFor(() => expect(result.current.indicator).toBe("UNAVAILABLE"));
    expect(result.current.state).toBe("OFF");
    expect(result.current.error).toBe("unreachable");
    unmount();
  });

  it("accepts orange or red only from evidenced external-reception detections", () => {
    const base = {
      state: "OFF" as const,
      updated_at: 1234,
      active_exchange_count: 0,
      accepted_total: 0,
      rejected_total: 0,
      last_verified_at: null,
      last_provider: null,
      last_agent_id: null,
      last_error_code: null,
      recent_observations: [],
    };

    expect(projectNetharionIndicator({
      ...base,
      agentic_detection: {
        level: "WEAK",
        source_mode: "external_reception",
        observed_at: 1234,
        score: 0.42,
        threshold: 0.8,
        evidence_refs: ["signal:weak-1"],
        candidate_ref: "candidate:weak-1",
      },
    })).toBe("WEAK_SIGNAL");

    expect(projectNetharionIndicator({
      ...base,
      agentic_detection: {
        level: "ADMITTED",
        source_mode: "external_reception",
        observed_at: 1234,
        score: 0.91,
        threshold: 0.8,
        evidence_refs: ["signal:admitted-1"],
        candidate_ref: "candidate:admitted-1",
        admission_ref: "admission:admitted-1",
        record_ref: "record:admitted-1",
        cognitive_notice_ref: "notice:admitted-1",
      },
    })).toBe("ADMITTED_EVENT");

    expect(projectNetharionIndicator({
      ...base,
      agentic_detection: {
        level: "ADMITTED",
        source_mode: "external_reception",
        observed_at: 1234,
        score: 0.91,
        threshold: 0.8,
        evidence_refs: [],
        candidate_ref: "candidate:malformed-1",
      },
    })).toBe("UNAVAILABLE");

    expect(projectNetharionIndicator({
      ...base,
      agentic_detection: {
        level: "ADMITTED",
        source_mode: "external_reception",
        observed_at: 1234,
        score: 0.91,
        threshold: 0.8,
        evidence_refs: ["signal:not-consumed"],
        candidate_ref: "candidate:not-consumed",
        admission_ref: "admission:not-consumed",
        record_ref: "record:not-consumed",
        cognitive_notice_ref: null,
      },
    })).toBe("UNAVAILABLE");

    expect(projectNetharionIndicator({
      ...base,
      agentic_detection: {
        level: "ADMITTED",
        source_mode: "symbolic_internal",
        observed_at: 1234,
        score: 1,
        threshold: 0.8,
        evidence_refs: ["symbolic:pulse"],
        candidate_ref: "candidate:symbolic",
        admission_ref: "admission:symbolic",
        record_ref: "record:symbolic",
        cognitive_notice_ref: "notice:symbolic",
      },
    })).toBe("UNAVAILABLE");
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/netharion", () => ({
  getNetharionChannel: vi.fn(),
}));

import { useNetharion } from "@/hooks/useNetharion";
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
    expect(result.current.channel?.recent_observations[0]).not.toHaveProperty("content");
    unmount();
  });

  it("reports OFF and does not poll while the backend is offline", async () => {
    const { result, unmount } = renderHook(() => useNetharion(10_000, false));

    await Promise.resolve();
    expect(mockedChannel).not.toHaveBeenCalled();
    expect(result.current.state).toBe("OFF");
    unmount();
  });

  it("reports DEGRADED after a channel request fails", async () => {
    mockedChannel.mockRejectedValue(new Error("unreachable"));
    const { result, unmount } = renderHook(() => useNetharion(10_000, true));
    await waitFor(() => expect(result.current.state).toBe("DEGRADED"));
    expect(result.current.error).toBe("unreachable");
    unmount();
  });
});

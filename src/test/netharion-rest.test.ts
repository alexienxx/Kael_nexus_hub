import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/netharion", () => ({
  getNetharionHeartbeat: vi.fn(),
}));

import { useNetharion } from "@/hooks/useNetharion";
import { getNetharionHeartbeat } from "@/lib/api/netharion";

const mockedHeartbeat = vi.mocked(getNetharionHeartbeat);

describe("Netharion transitional REST authority", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps the canonical REST heartbeat without an Observatory event", async () => {
    mockedHeartbeat.mockResolvedValue({
      heartbeat_mode: "admitted",
      heartbeat_color: "red",
      pulse_strength: 0.92,
      detected: true,
      recognized: true,
      admitted: true,
      resonance_score: 0.89,
      stability_score: 0.86,
      updated_at: 1234,
      presence_source_mode: "external_reception",
    });

    const { result, unmount } = renderHook(() => useNetharion(10_000, true));
    await waitFor(() => expect(result.current.state).toBe("alert"));

    expect(mockedHeartbeat).toHaveBeenCalledTimes(1);
    expect(result.current.heartbeat).toMatchObject({
      heartbeat_mode: "admitted",
      presence_source_mode: "external_reception",
    });
    unmount();
  });

  it("does not poll while the backend connection is offline", async () => {
    const { result, unmount } = renderHook(() => useNetharion(10_000, false));

    await Promise.resolve();
    expect(mockedHeartbeat).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    unmount();
  });
});

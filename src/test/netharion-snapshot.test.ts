import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/netharion", () => ({
  getNetharionHeartbeat: vi.fn(() => new Promise(() => undefined)),
}));

import { useNetharion } from "@/hooks/useNetharion";

describe("Netharion Observatory authority projection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefers canonical heartbeat fields and preserves external source authority", () => {
    const { result, unmount } = renderHook(() => useNetharion(10_000, true));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("kael-observatory-snapshot", {
          detail: {
            netharion: {
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
              // Conflicting legacy aliases must not replace canonical values.
              intensity: 0.1,
              resonance: 0.2,
              stability: 0.3,
              mode: "symbolic_internal",
            },
          },
        }),
      );
    });

    expect(result.current.state).toBe("alert");
    expect(result.current.heartbeat).toMatchObject({
      heartbeat_mode: "admitted",
      pulse_strength: 0.92,
      resonance_score: 0.89,
      stability_score: 0.86,
      presence_source_mode: "external_reception",
    });
    unmount();
  });

  it("never treats the legacy calm state label as source authority", () => {
    const { result, unmount } = renderHook(() => useNetharion(10_000, true));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("kael-observatory-snapshot", {
          detail: { netharion: { heartbeat_color: "green", mode: "calm" } },
        }),
      );
    });

    expect(result.current.heartbeat?.heartbeat_mode).toBe("calm");
    expect(result.current.heartbeat?.presence_source_mode).toBe("symbolic_internal");
    unmount();
  });
});

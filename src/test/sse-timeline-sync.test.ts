import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/sse", () => ({
  obtainSSEConnection: vi.fn().mockResolvedValue({
    token: "test-token",
    url: "http://backend/chat/events?token=test-token",
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

vi.mock("@/lib/telemetry/sseTelemetry", () => ({ emitTelemetry: vi.fn() }));

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.latest = this;
  }

  addEventListener(name: string, handler: EventListenerOrEventListenerObject) {
    const fn = handler as (event: MessageEvent) => void;
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }

  emit(name: string, data: object) {
    const event = new MessageEvent(name, { data: JSON.stringify(data) });
    for (const handler of this.listeners.get(name) ?? []) handler(event);
  }

  close() {
    this.closed = true;
  }
}

Object.defineProperty(globalThis, "EventSource", {
  configurable: true,
  writable: true,
  value: FakeEventSource,
});

import { useKaelSSE } from "@/hooks/useKaelSSE";
import { BACKEND_ROUTE_CHANGED_EVENT } from "@/lib/api/client";

const payload = (source: string) => ({
  turn_id: 42,
  role: "assistant",
  source,
  preview: "Nuovo turno",
  session_id: "mobile_kael",
  ts: 123,
});

describe("SSE canonical timeline sync", () => {
  afterEach(() => {
    FakeEventSource.latest = null;
    vi.clearAllMocks();
  });

  it("dispatches generic timeline sync for a reactive chat turn", async () => {
    const generic = vi.fn();
    const autonomous = vi.fn();
    window.addEventListener("kael-new-message", generic);
    window.addEventListener("kael-autonomous-message", autonomous);

    const { unmount } = renderHook(() => useKaelSSE(true));
    await waitFor(() => expect(FakeEventSource.latest).not.toBeNull());

    act(() => FakeEventSource.latest!.emit("new_message", payload("chat")));

    expect(generic).toHaveBeenCalledTimes(1);
    expect(autonomous).not.toHaveBeenCalled();
    unmount();
    window.removeEventListener("kael-new-message", generic);
    window.removeEventListener("kael-autonomous-message", autonomous);
  });

  it("dispatches timeline sync plus autonomous notification for autonomy", async () => {
    const generic = vi.fn();
    const autonomous = vi.fn();
    window.addEventListener("kael-new-message", generic);
    window.addEventListener("kael-autonomous-message", autonomous);

    const { unmount } = renderHook(() => useKaelSSE(true));
    await waitFor(() => expect(FakeEventSource.latest).not.toBeNull());

    act(() => FakeEventSource.latest!.emit("new_message", payload("autonomy_loop")));

    expect(generic).toHaveBeenCalledTimes(1);
    expect(autonomous).toHaveBeenCalledTimes(1);
    unmount();
    window.removeEventListener("kael-new-message", generic);
    window.removeEventListener("kael-autonomous-message", autonomous);
  });

  it("closes the route-bound stream and reconnects after LAN/Tailscale switch", async () => {
    const { unmount } = renderHook(() => useKaelSSE(true));
    await waitFor(() => expect(FakeEventSource.latest).not.toBeNull());
    const first = FakeEventSource.latest!;

    act(() => {
      window.dispatchEvent(new CustomEvent(BACKEND_ROUTE_CHANGED_EVENT));
    });

    await waitFor(() => expect(FakeEventSource.latest).not.toBe(first));
    expect(first.closed).toBe(true);
    unmount();
  });
});

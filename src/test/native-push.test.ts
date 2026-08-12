import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, (payload: any) => void>();
  const removed = vi.fn();
  return {
    listeners,
    removed,
    registerPlugin: vi.fn().mockResolvedValue(undefined),
    checkPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
    requestPermissions: vi.fn().mockResolvedValue({ receive: "granted" }),
    registerBackend: vi.fn().mockResolvedValue({ ok: true, configured: false }),
    fetchStatus: vi.fn().mockResolvedValue({ configured: true }),
    addListener: vi.fn((name: string, handler: (payload: any) => void) => {
      listeners.set(name, handler);
      return Promise.resolve({ remove: removed });
    }),
  };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock("@capacitor/app", () => ({
  App: { getInfo: vi.fn().mockResolvedValue({ version: "1.0.11", build: "111" }) },
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: mocks.addListener,
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    register: mocks.registerPlugin,
  },
}));

vi.mock("@/lib/api/push", () => ({
  fetchMobilePushStatus: mocks.fetchStatus,
  registerMobilePushDevice: mocks.registerBackend,
}));

import { useNativePush } from "@/hooks/useNativePush";

describe("native push durable timeline bridge", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KAEL_FIREBASE_PUSH_ENABLED", "true");
  });
  afterEach(() => {
    localStorage.clear();
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("never invokes Firebase from an APK built without Android resources", () => {
    vi.stubEnv("VITE_KAEL_FIREBASE_PUSH_ENABLED", "false");
    const { unmount } = renderHook(() => useNativePush(true));

    expect(mocks.fetchStatus).not.toHaveBeenCalled();
    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(mocks.registerPlugin).not.toHaveBeenCalled();
    unmount();
  });

  it("registers Android only after permission and never logs the token", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useNativePush(true));

    await waitFor(() => expect(mocks.registerPlugin).toHaveBeenCalledTimes(1));
    await act(async () => {
      await mocks.listeners.get("registration")?.({ value: "fcm-secret-token-value" });
    });

    expect(mocks.registerBackend).toHaveBeenCalledWith({
      installation_id: expect.stringMatching(/^.{8,}$/),
      token: "fcm-secret-token-value",
      platform: "android",
      app_version: "1.0.11 (111)",
    });
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("fcm-secret-token-value"),
    );
    unmount();
    logSpy.mockRestore();
  });

  it("turns a native notification into a cursor-backed timeline sync", async () => {
    const handler = vi.fn();
    window.addEventListener("kael-new-message", handler);
    const { unmount } = renderHook(() => useNativePush(true));

    await waitFor(() =>
      expect(mocks.listeners.has("pushNotificationReceived")).toBe(true),
    );
    act(() => {
      mocks.listeners.get("pushNotificationReceived")?.({
        data: { turn_id: "4170", source: "autonomy_loop" },
      });
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({
      turn_id: 4170,
      source: "autonomy_loop",
      delivery: "native_push",
    });

    unmount();
    window.removeEventListener("kael-new-message", handler);
  });

  it("never invokes the native plugin when Firebase is unconfigured", async () => {
    mocks.fetchStatus.mockResolvedValueOnce({ configured: false });
    const { unmount } = renderHook(() => useNativePush(true));

    await waitFor(() => expect(mocks.fetchStatus).toHaveBeenCalledTimes(1));
    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(mocks.registerPlugin).not.toHaveBeenCalled();
    unmount();
  });

  it("is inert while backend connectivity is disabled", () => {
    const { unmount } = renderHook(() => useNativePush(false));
    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(mocks.registerPlugin).not.toHaveBeenCalled();
    unmount();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_ROUTE_CHANGED_EVENT,
  getApiConfig,
  getBackendRouteSnapshot,
  probeAndResolveBackend,
  setApiConfig,
  tryRestorePreferredBackendRoute,
} from "@/lib/api/client";

const LAN = "http://192.168.178.78:8002";
const TAILSCALE = "http://100.89.31.50:8002";
const API_KEY = "route-test-credential";

function healthResponse(): Response {
  return new Response(JSON.stringify({
    status: "ok",
    service: "kael_refactor",
    service_fingerprint: "kael_refactor_v2",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("backend route failover", () => {
  let nowMs = 1_000_000;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    nowMs = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fails over LAN -> configured Tailscale, preserves preference, and fails back only after stable proofs", async () => {
    setApiConfig({ baseUrl: LAN, apiKey: API_KEY });
    const routeEvents: Array<Record<string, unknown>> = [];
    const onRoute = (event: Event) => {
      routeEvents.push((event as CustomEvent<Record<string, unknown>>).detail);
    };
    window.addEventListener(BACKEND_ROUTE_CHANGED_EVENT, onRoute);

    let lanHealthy = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${LAN}/health` && lanHealthy) return healthResponse();
      if (url === `${TAILSCALE}/health`) return healthResponse();
      return new Response("unreachable", { status: 503 });
    }));

    await expect(probeAndResolveBackend()).resolves.toBe(TAILSCALE);
    expect(getApiConfig()).toEqual({ baseUrl: TAILSCALE, apiKey: API_KEY });
    expect(getBackendRouteSnapshot()).toMatchObject({
      preferredBaseUrl: LAN,
      activeBaseUrl: TAILSCALE,
      activeKind: "tailscale",
      preferredHealthProofs: 0,
    });
    expect(routeEvents).toEqual([
      expect.objectContaining({ from: LAN, to: TAILSCALE, reason: "failover" }),
    ]);
    expect(localStorage.getItem("kael-backend-route-state-v1")).not.toContain(API_KEY);

    lanHealthy = true;
    nowMs += 60_000;
    await expect(tryRestorePreferredBackendRoute(nowMs)).resolves.toBeNull();
    expect(getApiConfig().baseUrl).toBe(TAILSCALE);
    expect(getBackendRouteSnapshot().preferredHealthProofs).toBe(1);

    nowMs += 15_001;
    await expect(tryRestorePreferredBackendRoute(nowMs)).resolves.toBe(LAN);
    expect(getApiConfig()).toEqual({ baseUrl: LAN, apiKey: API_KEY });
    expect(routeEvents[routeEvents.length - 1]).toEqual(
      expect.objectContaining({ from: TAILSCALE, to: LAN, reason: "preferred_restored" }),
    );

    window.removeEventListener(BACKEND_ROUTE_CHANGED_EVENT, onRoute);
  });
});

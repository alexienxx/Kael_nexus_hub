import { expect, test } from "@playwright/test";

const backend = process.env.KAEL_LIVE_BACKEND_URL ?? "http://127.0.0.1:8002";
const liveApiKey = process.env.KAEL_LIVE_API_KEY;

function protectedHeaders(): Record<string, string> {
  if (!liveApiKey) {
    throw new Error("KAEL_LIVE_API_KEY is required for protected live acceptance routes");
  }
  return { "X-KAEL-KEY": liveApiKey };
}

test.describe("@live Arrakis read-only acceptance", () => {
  test.beforeAll(() => {
    // Fail explicitly instead of producing false-green 401 schema assertions.
    protectedHeaders();
  });

  test("brain, history and SSE are reachable", async ({ request }) => {
    const health = await request.get(`${backend}/health`);
    expect(health.ok()).toBeTruthy();
    const healthBody = await health.json();
    expect(healthBody.status).toBe("ok");
    expect(healthBody.arrakis_brain_ready).toBe(true);

    const history = await request.get(
      `${backend}/chat/history/mixed?session_id=mobile_kael&limit=5`,
      { headers: protectedHeaders() },
    );
    expect(history.ok()).toBeTruthy();
    expect(Array.isArray((await history.json()).messages)).toBe(true);

    const sse = await request.get(`${backend}/health/sse`, { headers: protectedHeaders() });
    expect(sse.ok()).toBeTruthy();
    expect((await sse.json())).toEqual(expect.objectContaining({ connected_clients: expect.any(Number) }));
  });

  test("service and call read models keep stable schemas", async ({ request }) => {
    const services = await (await request.get(
      `${backend}/services?session_id=mobile_kael`,
      { headers: protectedHeaders() },
    )).json();
    expect(services.services.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining(["drive", "github", "calendar", "slack"]));
    for (const service of services.services) expect(service).toHaveProperty("connection_status");

    const calls = await (await request.get(
      `${backend}/mobile/call/active?session_id=mobile_kael`,
      { headers: protectedHeaders() },
    )).json();
    expect(Array.isArray(calls.active)).toBe(true);
    expect(calls.count).toBe(calls.active.length);
  });

  test("Spotify is an active Arrakis capability", async ({ request }) => {
    const status = await (await request.get(
      `${backend}/spotify/status`,
      { headers: protectedHeaders() },
    )).json();
    expect(status.mode).toBe("active_arrakis_capability");
    expect(status.has_state).toBe(true);
  });

  test("agentic status exposes the DTO consumed by the APK", async ({ request }) => {
    const status = await (await request.get(
      `${backend}/agentic/repo/status`,
      { headers: protectedHeaders() },
    )).json();
    expect(status.available).toBe(true);
    expect(Array.isArray(status.repos)).toBe(true);
    expect(Array.isArray(status.self_repos)).toBe(true);
  });
});

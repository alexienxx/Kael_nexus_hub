import { expect, test as base, type Page, type Route } from "@playwright/test";

export const MOCK_BACKEND_URL = "http://127.0.0.1:8002";

const health = {
  status: "ok",
  service: "kael_refactor",
  service_fingerprint: "kael_refactor_v2",
  listen_port: 8002,
  listen_host: "127.0.0.1",
  runtime_session_id: "e2e-runtime",
  bootstrap_pid: 1,
  backend_pid: 2,
  boot_verdict: "ready",
  boot_id: "e2e-boot",
  arrakis_brain_ready: true,
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

export async function seedAppStorage(page: Page, backendUrl = MOCK_BACKEND_URL) {
  await page.addInitScript(({ backendUrl: url }) => {
    localStorage.setItem("kael_boot_migration_v3", "e2e");
    localStorage.setItem("kael-backend-config", JSON.stringify({ baseUrl: url, apiKey: "" }));
    localStorage.setItem("kael_session_id", "mobile_kael");
  }, { backendUrl });
}

export async function installMockBackend(page: Page) {
  const persistedMessages: Array<Record<string, unknown>> = [];
  let turnCounter = 0;
  await page.route(`${MOCK_BACKEND_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/health") return json(route, health);
    if (path === "/health/sse") return json(route, { connected_clients: 1, pending_buffer_size: 0 });
    if (path === "/chat/session/default") return json(route, { session_id: "mobile_kael", aliases: [] });
    if (path === "/chat" && request.method() === "POST") {
      const body = request.postDataJSON() as { text: string; session_id: string; client_message_id?: string };
      turnCounter += 1;
      const timestamp = Date.now() / 1000;
      const userTurnId = `user-e2e-${turnCounter}`;
      const assistantTurnId = `assistant-e2e-${turnCounter}`;
      persistedMessages.push(
        { id: userTurnId, backend_turn_id: userTurnId, client_message_id: body.client_message_id, text: body.text, sender: "user", timestamp },
        { id: assistantTurnId, backend_turn_id: assistantTurnId, text: `Risposta E2E: ${body.text}`, sender: "kael", timestamp: timestamp + 0.001 },
      );
      return json(route, {
        reply: `Risposta E2E: ${body.text}`,
        sender: "kael",
        user_turn_id: userTurnId,
        assistant_turn_id: assistantTurnId,
        meta: {},
      });
    }
    if (path.startsWith("/chat/history/")) return json(route, { messages: persistedMessages, count: persistedMessages.length });
    if (path === "/chat/pending-autonomous") return json(route, { count: 0, messages: [] });
    if (path === "/chat/events/stats") return json(route, { events_total: 0, clients_connected: 1, pending_autonomous_count: 0, pending_sse_tokens: 0 });
    if (path === "/chat/review") return json(route, { messages: [] });
    if (path === "/chat/events") {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": e2e connected\n\n" });
    }

    if (path === "/services") {
      return json(route, { services: [
        { id: "drive", provider: "drive", display_name: "Google Drive", icon: "📂", capabilities: ["Upload files", "List files", "Share"], scopes: ["drive.file"], connection_status: "not_connected", account_label: null },
        { id: "github", provider: "github", display_name: "GitHub", icon: "🐙", capabilities: ["Repo audit"], scopes: ["repo"], connection_status: "not_connected", account_label: null },
        { id: "calendar", provider: "calendar", display_name: "Google Calendar", icon: "📅", capabilities: ["Create events"], scopes: ["calendar"], connection_status: "not_connected", account_label: null },
        { id: "slack", provider: "slack", display_name: "Slack", icon: "💬", capabilities: [], scopes: [], connection_status: "not_connected", account_label: null },
      ] });
    }
    if (path === "/projects") return json(route, { projects: [], count: 0, stats: {} });
    if (path === "/goals") return json(route, { goals: [], count: 0, stats: {} });

    if (path === "/media/status") return json(route, { ok: true, service: "media", total_images: 0, total_videos: 0, endpoints: [] });
    if (path === "/media/gallery") return json(route, { ok: true, items: [], total: 0, limit: 100, offset: 0 });
    if (path === "/multimodal/photos/list") return json(route, { ok: true, identity: url.searchParams.get("identity"), count: 0, items: [] });

    if (path === "/spotify/status") return json(route, { ok: true, service: "spotify", mode: "passive_receiver", has_state: false, is_fresh: false });
    if (path === "/spotify/context" || path === "/spotify/state") return json(route, { ok: true, available: false, context: null, state: null });
    if (path === "/spotify/suggestions") return json(route, { ok: true, suggestions: [] });

    if (path === "/mobile/call/active") return json(route, { active: [], count: 0 });
    if (path === "/mobile/call/start") return json(route, { call_id: "call-e2e", state: "ringing", status: "active", user_id: url.searchParams.get("user_id") });
    if (path === "/mobile/call/end") return json(route, { ok: true, call_id: url.searchParams.get("call_id"), turns: 0 });
    if (path === "/avatar/live/stream/start" || path === "/avatar/live/stream/stop") return json(route, { ok: true });
    if (path === "/avatar/live/stream") return route.fulfill({ status: 404, body: "" });

    if (path === "/agentic/repo/status") return json(route, { status: "ok", available: true, capabilities: [], repos: [], self_repos: [] });
    if (path.startsWith("/observatory/") || path.startsWith("/arrakis/observatory/")) {
      return json(route, { detail: "not wired in deterministic fixture" }, 501);
    }

    return json(route, { detail: `Unhandled E2E route: ${request.method()} ${path}` }, 404);
  });
}

export const test = base.extend({
  page: async ({ page }, providePage) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await seedAppStorage(page);
    await installMockBackend(page);
    await providePage(page);
    expect(pageErrors, "uncaught browser errors").toEqual([]);
  },
});

export { expect };
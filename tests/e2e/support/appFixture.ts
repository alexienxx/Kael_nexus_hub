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

    // route.fulfill() necessarily closes a synthetic text/event-stream body,
    // which makes native EventSource reconnect forever and pollutes unrelated
    // deterministic UI tests. SSE lifecycle has its own focused unit battery;
    // this fixture supplies one stable, open connection boundary.
    class DeterministicEventSource extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;

      readonly url: string;
      readonly withCredentials = false;
      readyState = DeterministicEventSource.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(sourceUrl: string | URL) {
        super();
        this.url = String(sourceUrl);
        queueMicrotask(() => {
          if (this.readyState !== DeterministicEventSource.CONNECTING) return;
          this.readyState = DeterministicEventSource.OPEN;
          const connected = new MessageEvent("connected", { data: "{}" });
          this.dispatchEvent(connected);
          this.onopen?.(connected);
        });
      }

      close(): void {
        this.readyState = DeterministicEventSource.CLOSED;
      }
    }

    Object.defineProperty(window, "EventSource", {
      configurable: true,
      writable: true,
      value: DeterministicEventSource,
    });
  }, { backendUrl });
}

export async function installMockBackend(page: Page) {
  const persistedMessages: Array<Record<string, unknown>> = [];
  const chatAttempts = new Map<string, number>();
  await page.route(`${MOCK_BACKEND_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/health") return json(route, health);
    if (path === "/health/sse") return json(route, { connected_clients: 1, pending_buffer_size: 0 });
    if (path === "/chat/session/default") return json(route, { session_id: "mobile_kael", aliases: [] });
    if (path === "/chat" && request.method() === "POST") {
      const body = request.postDataJSON() as { text: string; session_id: string; client_message_id?: string };
      const clientMessageId = String(body.client_message_id ?? "");
      const attempt = (chatAttempts.get(clientMessageId) ?? 0) + 1;
      chatAttempts.set(clientMessageId, attempt);
      const timestamp = Date.now() / 1000;
      const existingUser = persistedMessages.find((message) =>
        message.client_message_id === clientMessageId && message.sender === "user"
      );
      const stableNumber = Math.max(1, persistedMessages.length + 1);
      const userTurnId = existingUser?.id ?? stableNumber;
      const assistantTurnId = Number(userTurnId) + 1;

      if (!existingUser) {
        persistedMessages.push({
          id: userTurnId,
          backend_turn_id: userTurnId,
          client_message_id: clientMessageId,
          text: body.text,
          sender: "user",
          timestamp,
        });
      }

      if (body.text === "E2E_IN_PROGRESS_ONCE" && attempt === 1) {
        return json(route, {
          reply: "",
          session_id: body.session_id,
          client_message_id: clientMessageId,
          exchange_id: `exchange-${clientMessageId}`,
          exchange_status: "processing",
          outcome_kind: null,
          idempotent_replay: true,
          user_turn_id: userTurnId,
          assistant_turn_id: null,
          error: { code: "exchange_in_progress", retryable: true },
        }, 202);
      }

      if (body.text === "E2E_FIFO_FIRST") {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      if (body.text === "E2E_DURABLE_BEFORE_FETCH") {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }

      if (body.text === "E2E_RECOVERY_REQUIRED") {
        return json(route, {
          reply: "",
          session_id: body.session_id,
          client_message_id: clientMessageId,
          exchange_id: `exchange-${clientMessageId}`,
          exchange_status: "recovery_required",
          outcome_kind: "failure",
          idempotent_replay: true,
          user_turn_id: userTurnId,
          assistant_turn_id: null,
          error: { code: "cognition_outcome_requires_recovery", retryable: false },
        }, 409);
      }

      if (body.text === "E2E_SILENCE") {
        return json(route, {
          reply: "",
          session_id: body.session_id,
          client_message_id: clientMessageId,
          exchange_id: `exchange-${clientMessageId}`,
          exchange_status: "silence",
          outcome_kind: "silence",
          idempotent_replay: attempt > 1,
          user_turn_id: userTurnId,
          assistant_turn_id: null,
        });
      }

      const replyText = `Risposta E2E: ${body.text}`;
      const existingAssistant = persistedMessages.find((message) =>
        message.client_message_id === clientMessageId && message.sender === "kael"
      );
      const canonicalAssistantTurnId = existingAssistant?.id ?? assistantTurnId;
      if (!existingAssistant) {
        persistedMessages.push({
          id: canonicalAssistantTurnId,
          backend_turn_id: canonicalAssistantTurnId,
          client_message_id: clientMessageId,
          text: replyText,
          sender: "kael",
          timestamp: timestamp + 0.001,
        });
      }
      return json(route, {
        reply: replyText,
        sender: "kael",
        session_id: body.session_id,
        client_message_id: clientMessageId,
        exchange_id: `exchange-${clientMessageId}`,
        exchange_status: "complete",
        outcome_kind: "reply",
        idempotent_replay: attempt > 1,
        user_turn_id: userTurnId,
        assistant_turn_id: canonicalAssistantTurnId,
        meta: {},
      });
    }
    if (path === "/chat/history/pending") {
      const fromCursor = Number(url.searchParams.get("after_turn_id") ?? "0");
      const limit = Math.max(1, Math.min(2_000, Number(url.searchParams.get("limit") ?? "250")));
      const remaining = persistedMessages
        .filter((message) => Number(message.id ?? 0) > fromCursor)
        .sort((left, right) => Number(left.id ?? 0) - Number(right.id ?? 0));
      const messages = remaining.slice(0, limit);
      const nextCursor = messages.reduce(
        (cursor, message) => Math.max(cursor, Number(message.id ?? 0)),
        fromCursor,
      );
      return json(route, {
        messages,
        next_cursor: nextCursor,
        has_more: remaining.length > messages.length,
        cursor_kind: "conversation_turn_id",
      });
    }
    if (path === "/chat/history/messages") {
      return json(route, { messages: persistedMessages, count: persistedMessages.length });
    }
    if (path === "/chat/pending-autonomous") return json(route, { count: 0, messages: [] });
    if (path === "/chat/events/stats") return json(route, { events_total: 0, clients_connected: 1, pending_autonomous_count: 0, pending_sse_tokens: 0 });
    if (path === "/chat/review") return json(route, { messages: [] });
    if (path === "/chat/events/token") return json(route, { token: "e2e-sse-token" });
    if (path === "/chat/events") {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": e2e connected\n\n" });
    }
    if (path === "/presence/state") return json(route, { ok: true });
    if (path === "/cognition/netharion/heartbeat") {
      return json(route, {
        heartbeat_mode: "calm",
        heartbeat_color: "green",
        pulse_strength: 0.2,
        detected: false,
        recognized: false,
        admitted: false,
        resonance_score: 0,
        stability_score: 1,
        updated_at: Date.now() / 1000,
        presence_source_mode: "symbolic_internal",
      });
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

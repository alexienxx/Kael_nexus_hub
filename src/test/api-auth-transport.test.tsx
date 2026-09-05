import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackendConfig from "@/components/settings/BackendConfig";
import {
  ApiProtocolError,
  apiRequest,
  getApiConfig,
  parseStrictJsonBody,
  requestScopedResourceUrl,
  resetBackendUrlForDiscovery,
  setApiConfig,
  verifyBackendConfig,
} from "@/lib/api/client";
import {
  createAuthenticatedCallWebSocket,
  getAuthenticatedVoiceAudioUrl,
  getVoiceAudioResourcePath,
  requestTTS,
} from "@/lib/api/voice";
import { startAvatarStream } from "@/lib/api/avatar";
import { getGalleryFileUrl, getMediaGallery } from "@/lib/api/media";
import { sendExternalAgentMessage } from "@/lib/externalAgent";
import {
  downloadApk,
  fetchUpdateManifest,
  setManifestUrl,
} from "@/lib/api/updates";

const BACKEND = "http://127.0.0.1:8002";
const TEST_KEY = "unit-test-kael-credential";

function healthResponse(): Response {
  return new Response(JSON.stringify({
    status: "ok",
    service: "kael_refactor",
    service_fingerprint: "kael_refactor_v2",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function requestHeaders(init?: RequestInit): Headers {
  return new Headers(init?.headers);
}

describe("APK Gate-A authentication and JSON transport", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the credential when boot migration resets only discovery URL and never logs it", () => {
    setApiConfig({ baseUrl: "http://stale-host:8000", apiKey: TEST_KEY });
    const spies = ["debug", "info", "log", "warn", "error"].map((level) =>
      vi.spyOn(console, level as "log").mockImplementation(() => undefined),
    );

    resetBackendUrlForDiscovery();

    expect(getApiConfig()).toEqual({ baseUrl: "", apiKey: TEST_KEY });
    const diagnostics = spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join(" ");
    expect(diagnostics).not.toContain(TEST_KEY);
  });

  it("accepts JSON whitespace but rejects transport comments, junk and HTML prefixes", () => {
    expect(parseStrictJsonBody(" \r\n\t {\"ok\":true} \n")).toEqual({ ok: true });
    for (const prefix of [": keepalive\n", "proxy banner\n", "<html>bad gateway</html>"]) {
      expect(() => parseStrictJsonBody(`${prefix}{"ok":true}`)).toThrowError(ApiProtocolError);
    }
  });

  it("verifies public health and protected identity before accepting a candidate config", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        expect(requestHeaders(init).has("X-KAEL-KEY")).toBe(false);
        return healthResponse();
      }
      expect(url).toBe(`${BACKEND}/auth/verify`);
      expect(requestHeaders(init).get("X-KAEL-KEY")).toBe(TEST_KEY);
      return new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyBackendConfig({ baseUrl: `${BACKEND}/`, apiKey: ` ${TEST_KEY} ` }))
      .resolves.toEqual(expect.objectContaining({
        authentication: { ok: true, authenticated: true },
      }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing or wrong credential without replacing the last valid config", async () => {
    const previous = { baseUrl: "http://previous:8002", apiKey: "previous-credential" };
    setApiConfig(previous);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/health")) return healthResponse();
      return new Response(JSON.stringify({ detail: { code: "invalid_credentials" } }), {
        status: 401,
        statusText: "Unauthorized",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyBackendConfig({ baseUrl: BACKEND, apiKey: "" })).rejects.toThrow("required");
    await expect(verifyBackendConfig({ baseUrl: BACKEND, apiKey: "wrong" })).rejects.toMatchObject({ status: 401 });
    expect(getApiConfig()).toEqual(previous);
  });

  it("Settings cannot show connected or persist a candidate when protected verification fails", async () => {
    const previous = { baseUrl: "http://previous:8002", apiKey: "previous-credential" };
    setApiConfig(previous);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/health")) return healthResponse();
      return new Response(JSON.stringify({ detail: { code: "invalid_credentials" } }), { status: 403 });
    }));
    render(<BackendConfig />);

    fireEvent.change(screen.getByPlaceholderText("https://your-backend.com/api"), {
      target: { value: BACKEND },
    });
    fireEvent.change(screen.getByPlaceholderText("Inserisci la credenziale del backend"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva e Testa Connessione" }));

    await screen.findByText("Connessione o credenziale non valida");
    expect(screen.queryByText(/Backend autenticato e connesso/)).not.toBeInTheDocument();
    expect(getApiConfig()).toEqual(previous);
  });

  it("central client attaches the credential and rejects a prefixed JSON success body", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestHeaders(init).get("X-KAEL-KEY")).toBe(TEST_KEY);
      return new Response(`proxy banner\n${JSON.stringify({ ok: true })}`, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/protected-json")).rejects.toMatchObject({
      name: "ApiProtocolError",
      code: "invalid_json",
    });
  });

  it("routes TTS and external-agent JSON calls through authenticated transport", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/health")) return healthResponse();
      expect(requestHeaders(init).get("X-KAEL-KEY")).toBe(TEST_KEY);
      if (url.endsWith("/chat/voice/tts")) {
        return new Response(JSON.stringify({ audio_base64: btoa("wav") }), { status: 200 });
      }
      if (url.endsWith("/services/external-agent/chat")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          exchange_id: "external:test-message",
          session_id: "mobile_kael",
        });
        return new Response(JSON.stringify({
          reply: "risposta esterna",
          turn_id: 42,
          created: true,
          replayed: false,
          observation: {
            observation_id: "obs-1",
            observation_type: "external_agent_message",
            event_type: "message",
            provenance: {
              provider: "openai",
              agent_id: "gpt-4o",
              exchange_id: "external:test-message",
              conversation_id: "kael-main",
              source_event_id: "response-1",
              received_at: 1234,
              content_sha256: "a".repeat(64),
              verification_method: "server_side_provider_credential_and_response",
              transport_verified: true,
              claim_trust: "attributed_external_statement",
            },
          },
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTTS("ciao")).resolves.toBeInstanceOf(Blob);
    await expect(sendExternalAgentMessage(
      [{ role: "user", content: "ciao" }],
      { exchangeId: "external:test-message", sessionId: "mobile_kael" },
    )).resolves.toMatchObject({ reply: "risposta esterna", turn_id: 42 });

    const protectedUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => !url.endsWith("/health"));
    expect(protectedUrls).toEqual([
      `${BACKEND}/chat/voice/tts`,
      `${BACKEND}/services/external-agent/chat`,
    ]);
  });

  it("authenticates the backend update manifest without leaking the key to an override origin", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const manifest = {
      app_name: "Kael",
      latest_version: "1.0.13",
      version_name: "1.0.13",
      version_code: 13,
      apk_url: `${BACKEND}/app/download`,
      download_url: `${BACKEND}/app/download`,
      apk_filename: "kael.apk",
      apk_sha256: "a".repeat(64),
      apk_size_bytes: 1,
      release_notes: "test",
      changelog: [],
      force_update: false,
      published_at: "2026-09-04T00:00:00Z",
      release_date: "2026-09-04",
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Test-Auth": requestHeaders(init).get("X-KAEL-KEY") ?? "" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchUpdateManifest();
    expect(requestHeaders(fetchMock.mock.calls[0]?.[1]).get("X-KAEL-KEY")).toBe(TEST_KEY);

    setManifestUrl("https://updates.example.test/manifest.json");
    await fetchUpdateManifest();
    expect(requestHeaders(fetchMock.mock.calls[1]?.[1]).has("X-KAEL-KEY")).toBe(false);
  });

  it("exchanges the primary header for an exact short-lived resource URL", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const token = "scoped-resource-token-abcdefghijklmnopqrstuvwxyz";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${BACKEND}/auth/resource-token`);
      expect(requestHeaders(init).get("X-KAEL-KEY")).toBe(TEST_KEY);
      expect(JSON.parse(String(init?.body))).toEqual({
        method: "GET",
        path: "/media/gallery/asset-1/file",
      });
      return new Response(JSON.stringify({
        token,
        expires_in: 300,
        max_uses: 32,
        method: "GET",
        path: "/media/gallery/asset-1/file",
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = await requestScopedResourceUrl("/media/gallery/asset-1/file");

    expect(url).toBe(
      `${BACKEND}/media/gallery/asset-1/file?kael_access_token=${token}`,
    );
    expect(url).not.toContain(TEST_KEY);
  });

  it("rejects ambiguous resource paths before any credential exchange", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const path of [
      "//hostile.example/media/gallery/asset/file",
      "/media/gallery/asset/file?other=1",
      "/media/gallery/../file",
      "/media\\gallery\\asset\\file",
    ]) {
      await expect(requestScopedResourceUrl(path)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("materializes only same-origin scoped gallery URLs and refreshes a file token by asset ID", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const item = {
      id: "asset-1",
      type: "image" as const,
      url: "/media/gallery/asset-1/file?kael_access_token=file-token",
      thumbnail: "/media/gallery/asset-1/thumbnail?kael_access_token=thumb-token",
      prompt: null,
      caption: null,
      source: "kael",
      size_bytes: 12,
      created_at: "2026-09-04T00:00:00Z",
      session_id: "default",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/media/gallery?type=image")) {
        return new Response(JSON.stringify({ ok: true, items: [item], total: 1 }), { status: 200 });
      }
      if (url.endsWith("/media/gallery/asset-1")) {
        return new Response(JSON.stringify({
          ok: true,
          item: { ...item, url: "/media/gallery/asset-1/file?kael_access_token=fresh-token" },
        }), { status: 200 });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const gallery = await getMediaGallery("image");
    expect(gallery.items[0].url).toBe(
      `${BACKEND}/media/gallery/asset-1/file?kael_access_token=file-token`,
    );
    expect(gallery.items[0].thumbnail).toBe(
      `${BACKEND}/media/gallery/asset-1/thumbnail?kael_access_token=thumb-token`,
    );
    await expect(getGalleryFileUrl("asset-1")).resolves.toBe(
      `${BACKEND}/media/gallery/asset-1/file?kael_access_token=fresh-token`,
    );

    const hostile = { ...item, url: "https://hostile.example/asset.png" };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, items: [hostile], total: 1 }), { status: 200 }),
    ));
    await expect(getMediaGallery("image")).rejects.toThrow("not owned");
  });

  it("starts avatar transport and opens call WebSocket with scoped tokens, never the primary key", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(requestHeaders(init).get("X-KAEL-KEY")).toBe(TEST_KEY);
      if (url.endsWith("/avatar/live/stream/start")) {
        return new Response(JSON.stringify({ ok: true, status: "started", fps: 15 }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body));
      const isSocket = body.method === "WEBSOCKET";
      return new Response(JSON.stringify({
        token: isSocket
          ? "scoped-websocket-token-abcdefghijklmnopqrstuvwxyz"
          : "scoped-avatar-token-abcdefghijklmnopqrstuvwxyz",
        expires_in: 60,
        max_uses: isSocket ? 1 : 2,
        method: body.method,
        path: body.path,
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const opened: string[] = [];
    class FakeWebSocket {
      constructor(url: string | URL) {
        opened.push(String(url));
      }
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const avatar = await startAvatarStream();
    await createAuthenticatedCallWebSocket();

    expect(avatar.stream_url).toContain(
      `${BACKEND}/avatar/live/stream?kael_access_token=scoped-avatar-token-`,
    );
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain(
      "ws://127.0.0.1:8002/mobile/ws/call?kael_access_token=scoped-websocket-token-",
    );
    expect(`${avatar.stream_url} ${opened[0]}`).not.toContain(TEST_KEY);
  });

  it("keeps durable voice paths separate from ephemeral authenticated playback URLs", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    expect(getVoiceAudioResourcePath({ tts_url: "/voice/audio/trace_123" }))
      .toBe("/voice/audio/trace_123");
    expect(getVoiceAudioResourcePath({ tts_url: `${BACKEND}/voice/audio/trace-456` }))
      .toBe("/voice/audio/trace-456");
    expect(getVoiceAudioResourcePath({ tts_url: "https://hostile.example/voice/audio/trace" }))
      .toBeUndefined();
    expect(getVoiceAudioResourcePath({ voice_audio: "raw-base64" }))
      .toBeUndefined();

    const token = "scoped-voice-audio-token-abcdefghijklmnopqrstuvwxyz";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestHeaders(init).get("X-KAEL-KEY")).toBe(TEST_KEY);
      expect(JSON.parse(String(init?.body))).toEqual({
        method: "GET",
        path: "/voice/audio/trace_123",
      });
      return new Response(JSON.stringify({
        token,
        expires_in: 300,
        max_uses: 32,
        method: "GET",
        path: "/voice/audio/trace_123",
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAuthenticatedVoiceAudioUrl("/voice/audio/trace_123"))
      .resolves.toBe(`${BACKEND}/voice/audio/trace_123?kael_access_token=${token}`);
    await expect(getAuthenticatedVoiceAudioUrl("/voice/audio/../secret"))
      .rejects.toThrow("Invalid voice audio resource path");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("downloads a same-origin APK through a scoped URL without exposing the primary key", async () => {
    setApiConfig({ baseUrl: BACKEND, apiKey: TEST_KEY });
    const token = "scoped-apk-download-token-abcdefghijklmnopqrstuvwxyz";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/resource-token")) {
        expect(requestHeaders(init).get("X-KAEL-KEY")).toBe(TEST_KEY);
        expect(JSON.parse(String(init?.body))).toEqual({
          method: "GET",
          path: "/app/download/kael-113-a1b2c3d4.apk",
        });
        return new Response(JSON.stringify({
          token,
          expires_in: 180,
          max_uses: 8,
          method: "GET",
          path: "/app/download/kael-113-a1b2c3d4.apk",
        }), { status: 200 });
      }
      expect(url).toBe(
        `${BACKEND}/app/download/kael-113-a1b2c3d4.apk?kael_access_token=${token}`,
      );
      expect(url).not.toContain(TEST_KEY);
      expect(requestHeaders(init).has("X-KAEL-KEY")).toBe(false);
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Length": "3" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:kael-apk"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await downloadApk("/app/download/kael-113-a1b2c3d4.apk");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

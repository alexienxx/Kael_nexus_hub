import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackendConfig from "@/components/settings/BackendConfig";
import {
  ApiProtocolError,
  apiRequest,
  getApiConfig,
  parseStrictJsonBody,
  resetBackendUrlForDiscovery,
  setApiConfig,
  verifyBackendConfig,
} from "@/lib/api/client";
import { requestTTS } from "@/lib/api/voice";
import { sendExternalAgentMessage } from "@/lib/externalAgent";
import {
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
        return new Response(JSON.stringify({ reply: "risposta esterna" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestTTS("ciao")).resolves.toBeInstanceOf(Blob);
    await expect(sendExternalAgentMessage([{ role: "user", content: "ciao" }]))
      .resolves.toBe("risposta esterna");

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
});

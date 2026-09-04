import { afterEach, describe, expect, it, vi } from "vitest";

const { apiRequestMock, apiUploadMock, ensureBackendAliveMock, getApiConfigMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  apiUploadMock: vi.fn(),
  ensureBackendAliveMock: vi.fn().mockResolvedValue(true),
  getApiConfigMock: vi.fn(() => ({ baseUrl: "http://127.0.0.1:8002", apiKey: "" })),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: apiRequestMock,
  apiUpload: apiUploadMock,
  ensureBackendAlive: ensureBackendAliveMock,
  getApiConfig: getApiConfigMock,
}));

import {
  fetchPendingMessages,
  sendDurableTextEnvelope,
  sendImage,
  sendMessage,
  sendVoiceNote,
  validatePendingMessagesResponse,
} from "@/lib/api/chat";

describe("chat api time contract", () => {
  afterEach(() => {
    apiRequestMock.mockReset();
    apiUploadMock.mockReset();
    ensureBackendAliveMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("sendMessage includes client_time ISO in the request body", async () => {
    apiRequestMock.mockResolvedValue({ ok: true });

    await sendMessage("ciao", "mobile_kael", undefined, "client-msg-1");

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [, options] = apiRequestMock.mock.calls[0];
    const body = JSON.parse(String(options.body));
    expect(body.client_time).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(body.client_message_id).toBe("client-msg-1");
  });

  it("sendMessage includes quoted_message payload when provided", async () => {
    apiRequestMock.mockResolvedValue({ ok: true });

    await sendMessage("rispondo", "mobile_kael", undefined, "client-msg-2", {
      quoted_message_id: "msg-123",
      quoted_turn_id: "456",
      quoted_session_id: "mobile_kael",
      quoted_author: "autonomous",
      quoted_channel: "chat",
      quoted_created_at: "2026-05-17T12:00:00.000Z",
      quoted_text_preview: "Ti avevo scritto prima...",
      quoted_text_hash: null,
      quoted_full_text_available: true,
      quoted_autonomy_id: "autonomy-77",
      quoted_parent_message_id: null,
      quoted_topic_id: "topic-alpha",
      quoted_memory_candidate: null,
    });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [, options] = apiRequestMock.mock.calls[0];
    const body = JSON.parse(String(options.body));
    expect(body.quoted_message).toMatchObject({
      quoted_message_id: "msg-123",
      quoted_author: "autonomous",
      quoted_channel: "chat",
      quoted_session_id: "mobile_kael",
    });
  });

  it("fetchPendingMessages sends a durable turn cursor and bounded page size", async () => {
    apiRequestMock.mockResolvedValue({
      messages: [],
      next_cursor: 4170,
      has_more: false,
      cursor_kind: "conversation_turn_id",
    });

    await fetchPendingMessages(123.5, "mobile_kael", 4168, 100);

    const [path] = apiRequestMock.mock.calls[0];
    const query = new URL(String(path), "http://localhost").searchParams;
    expect(query.get("after_turn_id")).toBe("4168");
    expect(query.get("after_ts")).toBe("123.5");
    expect(query.get("limit")).toBe("100");
  });

  it("rejects non-canonical, backwards, and stalled pending cursors", () => {
    expect(() => validatePendingMessagesResponse({
      messages: [],
      next_cursor: 10,
      has_more: false,
      cursor_kind: "message_id",
    }, 9)).toThrow("cursor kind");
    expect(() => validatePendingMessagesResponse({
      messages: [],
      next_cursor: 8,
      has_more: false,
      cursor_kind: "conversation_turn_id",
    }, 9)).toThrow("cursor is invalid");
    expect(() => validatePendingMessagesResponse({
      messages: [],
      next_cursor: 9,
      has_more: true,
      cursor_kind: "conversation_turn_id",
    }, 9)).toThrow("did not advance");
  });

  it.each([
    [202, "processing"],
    [409, "recovery_required"],
  ])("durable text transport preserves exact body and exposes HTTP %i", async (status, exchangeStatus) => {
    const requestBody = {
      text: "corpo identico",
      session_id: "mobile_kael",
      client_time: "2026-09-04T10:00:00.000Z",
      client_message_id: "0b2d6122-32ad-4674-840f-f676338d5797",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      `: keepalive\n${JSON.stringify({
        reply: "",
        session_id: "mobile_kael",
        client_message_id: requestBody.client_message_id,
        exchange_status: exchangeStatus,
        error: { code: exchangeStatus, retryable: status === 202 },
      })}`,
      { status, headers: { "Content-Type": "application/json", "Retry-After": "2" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDurableTextEnvelope(requestBody);

    expect(result.status).toBe(status);
    expect(result.body.exchange_status).toBe(exchangeStatus);
    expect(result.retryAfterSeconds).toBe(2);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual(requestBody);
    expect(init.headers["Idempotency-Key"]).toBe(requestBody.client_message_id);
  });

  it.each([
    [401, "", "empty"],
    [409, "not-json", "invalid_json"],
    [503, "<html>bad gateway</html>", "invalid_json"],
  ])("preserves HTTP %i even when its body is not JSON", async (status, body, parseError) => {
    const requestBody = {
      text: "corpo identico",
      session_id: "mobile_kael",
      client_time: "2026-09-04T10:00:00.000Z",
      client_message_id: "0b2d6122-32ad-4674-840f-f676338d5797",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));

    const result = await sendDurableTextEnvelope(requestBody);

    expect(result.status).toBe(status);
    expect(result.body).toEqual({});
    expect(result.bodyParseError).toBe(parseError);
  });
  it("media sends also attach client_time to form payloads", async () => {
    apiUploadMock.mockResolvedValue({ ok: true });

    await sendImage(new File(["img"], "test.png", { type: "image/png" }), "mobile_kael", "check");
    await sendVoiceNote(new Blob(["audio"], { type: "audio/webm" }), "mobile_kael", "voice-msg-1");

    const [, imageForm] = apiUploadMock.mock.calls[0];
    const [, voiceForm] = apiUploadMock.mock.calls[1];
    expect(imageForm.get("client_time")).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(voiceForm.get("client_time")).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });
});

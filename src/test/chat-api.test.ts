import { afterEach, describe, expect, it, vi } from "vitest";

const { apiRequestMock, apiUploadMock, ensureBackendAliveMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  apiUploadMock: vi.fn(),
  ensureBackendAliveMock: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/api/client", () => ({
  apiRequest: apiRequestMock,
  apiUpload: apiUploadMock,
  ensureBackendAlive: ensureBackendAliveMock,
}));

import { sendImage, sendMessage, sendVoiceNote } from "@/lib/api/chat";

describe("chat api time contract", () => {
  afterEach(() => {
    apiRequestMock.mockReset();
    apiUploadMock.mockReset();
    ensureBackendAliveMock.mockClear();
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
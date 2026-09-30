import { describe, expect, it } from "vitest";
import {
  createAssistantSpeechRequest,
  validateAssistantSpeechResponse,
} from "@/lib/audio/nativeCallVoiceService";

const SPEECH_PLAN_SHA256 = "a".repeat(64);

function speechHeaders(callId: string): Headers {
  return new Headers({
    "X-Arrakis-Audio-Protocol": "arrakis_pcm_frames_v1",
    "X-Arrakis-Delivery-Id": "delivery-1",
    "X-Arrakis-Utterance-Id": "utterance-1",
    "X-Arrakis-Epoch": "7",
    "X-Arrakis-Call-Id": callId,
    "X-Arrakis-Sample-Rate": "24000",
    "X-Arrakis-Channels": "1",
    "X-Arrakis-Encoding": "pcm_s16le",
    "X-Arrakis-Speech-Plan-SHA256": SPEECH_PLAN_SHA256,
  });
}

describe("call-bound native speech request", () => {
  it("sends the lifecycle call id with the canonical session", () => {
    const request = createAssistantSpeechRequest(42, "mobile", "call.lifecycle-1");
    const url = new URL(request.path, "https://local.invalid");

    expect(url.pathname).toBe("/audio/speech/42");
    expect(url.searchParams.get("session_id")).toBe("mobile");
    expect(url.searchParams.get("call_id")).toBe("call.lifecycle-1");
    expect(request.options.method).toBe("POST");
  });

  it("rejects a response bound to a different call before PCM consumption", async () => {
    const response = new Response(new Uint8Array([1, 2]), {
      headers: speechHeaders("call.other"),
    });

    await expect(
      validateAssistantSpeechResponse(response, "call.lifecycle-1"),
    ).rejects.toThrow("AUDIO_STREAM_CALL_BINDING_INVALID");
  });

  it("preserves the canonical speech-plan digest in the PCM binding", async () => {
    const response = new Response(new Uint8Array([1, 2]), {
      headers: speechHeaders("call.lifecycle-1"),
    });

    const result = await validateAssistantSpeechResponse(response, "call.lifecycle-1");

    expect(result.binding.speechPlanSha256).toBe(SPEECH_PLAN_SHA256);
    await result.response.body?.cancel();
  });

  it.each([
    ["missing", null],
    ["malformed", "A".repeat(64)],
  ])("rejects a %s speech-plan digest before PCM consumption", async (_case, digest) => {
    const headers = speechHeaders("call.lifecycle-1");
    if (digest === null) headers.delete("X-Arrakis-Speech-Plan-SHA256");
    else headers.set("X-Arrakis-Speech-Plan-SHA256", digest);
    const response = new Response(new Uint8Array([1, 2]), { headers });

    await expect(
      validateAssistantSpeechResponse(response, "call.lifecycle-1"),
    ).rejects.toThrow("AUDIO_STREAM_BINDING_INVALID");
  });
});

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const voiceSource = readFileSync(
  new URL("../../../src/lib/api/voice.ts", import.meta.url),
  "utf8",
);
const callsSource = readFileSync(
  new URL("../../../src/pages/Calls.tsx", import.meta.url),
  "utf8",
);

test.describe("Calls production boundary", () => {
  test("uses only the canonical call lifecycle and finalized audio ingress", () => {
    expect(voiceSource).toContain("/audio/calls/start?session_id=");
    expect(voiceSource).toContain("/audio/calls/active?session_id=");
    expect(voiceSource).toContain("/audio/calls/incoming?session_id=");
    expect(voiceSource).toContain("/answer?session_id=");
    expect(voiceSource).toContain("/dismiss?session_id=");
    expect(voiceSource).toContain("/end?session_id=");
    expect(voiceSource).toContain("/audio/notes?");
    expect(voiceSource).toContain("call_id: callId");
    expect(voiceSource).not.toContain("/mobile/call/");
  });

  test("keeps transcripts and legacy text/audio replies out of the call screen", () => {
    expect(callsSource).toContain("sendCanonicalCallTurn");
    expect(callsSource).toContain("nativeCallVoiceService.playAssistantTurn");
    expect(callsSource).not.toMatch(/TranscriptEntry|setTranscript|transcript\.map/);
    expect(callsSource).not.toMatch(/response\.(?:transcription|reply_text|reply_audio_base64)/);
    expect(callsSource).not.toContain("sendCallVoiceMessage");
  });
});

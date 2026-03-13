import { apiRequest, apiFetchAudio, apiUpload } from "./client";
import type { CallSession, TranscriptEntry } from "@/types";

/** Request TTS playback audio for a text message */
export async function requestTTS(text: string): Promise<Blob> {
  return apiFetchAudio(`/voice/tts?text=${encodeURIComponent(text)}`);
}

/** Initiate a voice call */
export async function initiateCall(sessionId: string) {
  return apiRequest<{
    call_id: string;
    state: string;
  }>("/calls/start", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/** End an active call */
export async function endCall(callId: string, sessionId: string) {
  return apiRequest("/calls/end", {
    method: "POST",
    body: JSON.stringify({ call_id: callId, session_id: sessionId }),
  });
}

/** Get call transcript updates */
export async function getCallTranscript(sessionId: string) {
  return apiRequest<{ entries: TranscriptEntry[] }>(
    `/call/transcript?sessionId=${sessionId}`
  );
}

/** Answer an incoming call from Kael */
export async function answerCall(sessionId: string) {
  return apiRequest<{ session: CallSession }>("/call/answer", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

/** Dismiss an incoming call */
export async function dismissCall(sessionId: string) {
  return apiRequest("/call/dismiss", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

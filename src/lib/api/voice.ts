import { apiRequest, apiFetchAudio, apiUpload } from "./client";
import type { CallSession, TranscriptEntry } from "@/types";

/** Send a voice note (audio blob) */
export async function sendVoiceNote(audioBlob: Blob) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice-note.webm");
  return apiUpload<{ transcription?: string; reply?: { text: string; audioUrl?: string } }>(
    "/voice/send",
    formData
  );
}

/** Request TTS playback audio for a text message */
export async function requestTTS(text: string): Promise<Blob> {
  return apiFetchAudio(`/voice/tts?text=${encodeURIComponent(text)}`);
}

/** Initiate a voice call */
export async function initiateCall() {
  return apiRequest<{ session: CallSession }>("/call/initiate", {
    method: "POST",
  });
}

/** End an active call */
export async function endCall(sessionId: string) {
  return apiRequest("/call/end", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
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

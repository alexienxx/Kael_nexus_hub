import { apiRequest, apiFetchAudio, apiUpload } from "./client";
import type { CallSession, TranscriptEntry } from "@/types";

/**
 * VOICE & CALL API SERVICE LAYER
 *
 * VERIFIED ENDPOINTS:
 * - POST /mobile/call/start
 * - POST /mobile/call/end
 * - GET /voice/tts
 *
 * PENDING BACKEND VERIFICATION:
 * - GET /mobile/call/active
 * - WS /mobile/ws/call
 * - GET /call/transcript
 * - POST /call/answer
 * - POST /call/dismiss
 *
 * These endpoints reflect the expected contracts but may require
 * adjustment once backend implementation is confirmed.
 */

/** Request TTS playback audio for a text message */
export async function requestTTS(text: string): Promise<Blob> {
  return apiFetchAudio(`/voice/tts?text=${encodeURIComponent(text)}`);
}

/** Initiate a voice call */
export async function initiateCall(sessionId: string) {
  return apiRequest<{
    call_id: string;
    state: string;
  }>("/mobile/call/start", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/** End an active call */
export async function endCall(callId: string, sessionId: string) {
  return apiRequest("/mobile/call/end", {
    method: "POST",
    body: JSON.stringify({ call_id: callId, session_id: sessionId }),
  });
}

/** Get active call status (pending backend verification) */
export async function getActiveCall(sessionId: string) {
  return apiRequest<{ call: CallSession | null }>(
    `/mobile/call/active?session_id=${sessionId}`
  );
}

/**
 * WebSocket endpoint for real-time call transcription updates
 * Endpoint: ws://{baseUrl}/mobile/ws/call?session_id={sessionId}&call_id={callId}
 *
 * This is a WebSocket connection and requires separate handling.
 * Use native WebSocket API to connect:
 *
 * const ws = new WebSocket(`ws://${baseUrl}/mobile/ws/call?session_id=${sessionId}&call_id=${callId}`);
 * ws.onmessage = (event) => {
 *   const update = JSON.parse(event.data);
 *   // Handle transcript update
 * };
 */

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

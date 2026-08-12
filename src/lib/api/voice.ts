import { apiRequest, apiUpload, getApiConfig, ensureBackendAlive } from "./client";
import type { CallSession } from "@/types";

/**
 * VOICE & CALL API SERVICE LAYER
 *
 * VERIFIED ENDPOINTS:
 * - POST /chat/voice/tts           (TTS, JSON body → base64 audio)
 * - POST /mobile/call/start        (start call)
 * - POST /mobile/call/end          (end call)
 * - GET  /mobile/call/active       (active call status)
 * - POST /mobile/call/incoming/answer  (answer incoming)
 * - POST /mobile/call/incoming/dismiss (dismiss incoming)
 *
 */

/** Request TTS playback audio for a text message */
export async function requestTTS(text: string, language: string = "it", sessionId: string = "default"): Promise<Blob> {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  // Backend expects POST /chat/voice/tts with JSON body
  const config = getApiConfig();
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/voice/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, session_id: sessionId }),
  });
  if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
  const data = await response.json();
  // Decode base64 audio_base64 to Blob
  const binaryStr = atob(data.audio_base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new Blob([bytes], { type: "audio/wav" });
}

/** Initiate a voice call */
export async function initiateCall(sessionId: string) {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  return apiRequest<{
    call_id: string;
    state: string;
  }>(`/mobile/call/start?user_id=${encodeURIComponent(sessionId)}`, {
    method: "POST",
  });
}

/** End an active call */
export async function endCall(callId: string, sessionId: string) {
  void sessionId;
  return apiRequest(`/mobile/call/end?call_id=${encodeURIComponent(callId)}`, {
    method: "POST",
  });
}

/** Get active call status (pending backend verification) */
export async function getActiveCall(sessionId: string) {
  const response = await apiRequest<{ call?: CallSession | null; active?: CallSession[] }>(
    `/mobile/call/active?session_id=${sessionId}`
  );
  return { call: response.call ?? response.active?.[0] ?? null };
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

/** Answer an incoming call from Kael */
export async function answerCall(sessionId: string) {
  return apiRequest<{ session: CallSession }>(`/mobile/call/incoming/answer?user_id=${encodeURIComponent(sessionId)}`, {
    method: "POST",
  });
}

/** Dismiss an incoming call */
export async function dismissCall(sessionId: string) {
  void sessionId;
  return apiRequest("/mobile/call/incoming/dismiss", {
    method: "POST",
  });
}

/** Response shape from POST /mobile/call/voice */
export interface VoiceCallTurnResponse {
  reply: string;
  reply_audio_base64?: string;
  transcription?: string;
  emotion?: string;
  call_id?: string;
}

/**
 * Send an audio chunk to the backend during an active call.
 *
 * Endpoint: POST /mobile/call/voice
 * The backend runs STT → emotion → LLM → TTS and returns both the text
 * reply and a base64-encoded WAV for immediate playback.
 *
 * @param callId     - Active call ID returned by initiateCall / answerCall
 * @param audioBase64 - Raw audio bytes as base64 string (webm/ogg/wav)
 * @param sessionId  - Current Kael session ID
 */
export async function sendCallVoiceMessage(
  callId: string,
  audioBase64: string,
  sessionId: string,
): Promise<VoiceCallTurnResponse> {
  const response = await apiRequest<{
    reply_text: string;
    reply_audio_base64?: string;
    emotion?: string;
    call_id?: string;
  }>("/mobile/call/voice", {
    method: "POST",
    body: JSON.stringify({
      user_id: sessionId,
      call_id: callId,
      audio_base64: audioBase64,
    }),
  });
  return { ...response, reply: response.reply_text };
}

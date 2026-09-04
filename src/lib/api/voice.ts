import {
  apiRequest,
  ensureBackendAlive,
  getApiConfig,
  requestScopedResourceUrl,
} from "./client";
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

/**
 * Create a first-party call socket without placing the primary API credential
 * in the URL. The current Calls screen still uses the bounded HTTP audio path;
 * this factory is the authenticated transport boundary for WebSocket clients.
 */
export async function createAuthenticatedCallWebSocket(): Promise<WebSocket> {
  const url = await requestScopedResourceUrl("/mobile/ws/call", "WEBSOCKET");
  return new WebSocket(url);
}

const VOICE_AUDIO_PATH = /^\/voice\/audio\/[A-Za-z0-9_-]{1,128}$/;

/**
 * Recover only the durable local asset path from a chat payload. A scoped URL
 * is deliberately never returned from, or written back into, durable chat.
 */
export function getVoiceAudioResourcePath(
  payload: Record<string, unknown>,
): string | undefined {
  const raw = payload.tts_url ?? payload.ttsUrl;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const value = raw.trim();
  try {
    const configBase = new URL(getApiConfig().baseUrl);
    const resource = new URL(value, configBase);
    if (resource.origin !== configBase.origin || !VOICE_AUDIO_PATH.test(resource.pathname)) {
      return undefined;
    }
    return resource.pathname;
  } catch {
    return undefined;
  }
}

/** Resolve one persisted voice asset to an ephemeral, same-origin audio URL. */
export async function getAuthenticatedVoiceAudioUrl(path: string): Promise<string> {
  if (!VOICE_AUDIO_PATH.test(String(path ?? ""))) {
    throw new Error("Invalid voice audio resource path");
  }
  return requestScopedResourceUrl(path);
}

/** Request TTS playback audio for a text message */
export async function requestTTS(text: string, language: string = "it", sessionId: string = "default"): Promise<Blob> {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  // Protected JSON calls go through the canonical client so the configured
  // Kael credential and strict response contract are always applied.
  const data = await apiRequest<{ audio_base64: string }>("/chat/voice/tts", {
    method: "POST",
    body: JSON.stringify({ text, language, session_id: sessionId }),
  });
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

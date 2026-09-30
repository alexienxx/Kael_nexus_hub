import {
  apiRequest,
  ensureBackendAlive,
} from "./client";
import type { CallSession } from "@/types";

/**
 * VOICE & CALL API SERVICE LAYER
 *
 * VERIFIED ENDPOINTS:
 * - POST /audio/calls/start
 * - GET  /audio/calls/active
 * - GET  /audio/calls/incoming
 * - POST /audio/calls/{call_id}/answer|dismiss|end
 * - POST /audio/notes (..., call_id)
 * - POST /audio/speech/{assistant_turn_id}
 *
 */

/** Initiate a voice call */
export async function initiateCall(sessionId: string) {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  return apiRequest<CallSession>(`/audio/calls/start?session_id=${encodeURIComponent(sessionId)}`, {
    method: "POST",
  });
}

/** End an active call */
export async function endCall(callId: string, sessionId: string) {
  return apiRequest<CallSession>(
    `/audio/calls/${encodeURIComponent(callId)}/end?session_id=${encodeURIComponent(sessionId)}`,
    {
    method: "POST",
    },
  );
}

/** Get the active canonical call bound to this conversation and principal. */
export async function getActiveCall(sessionId: string) {
  return apiRequest<{ call: CallSession | null }>(
    `/audio/calls/active?session_id=${encodeURIComponent(sessionId)}`,
  );
}

/**
 * Calls currently use bounded finalized utterances. Future duplex transport
 * must carry audio frames and cancellation, never transcript UI messages.
 */

/** Answer a server-created incoming call. */
export async function answerCall(callId: string, sessionId: string) {
  return apiRequest<CallSession>(
    `/audio/calls/${encodeURIComponent(callId)}/answer?session_id=${encodeURIComponent(sessionId)}`,
    { method: "POST" },
  );
}

/** Dismiss an incoming call */
export async function dismissCall(callId: string, sessionId: string) {
  return apiRequest<CallSession>(
    `/audio/calls/${encodeURIComponent(callId)}/dismiss?session_id=${encodeURIComponent(sessionId)}`,
    { method: "POST" },
  );
}

export interface CanonicalCallTurn {
  assistantTurnId: number;
  exchangeId?: string;
}

/** Read-only incoming-call lifecycle query. It carries no audio or transcript. */
export async function getIncomingCall(sessionId: string): Promise<{ call: CallSession | null }> {
  return apiRequest<{ call: CallSession | null }>(
    `/audio/calls/incoming?session_id=${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
}

/**
 * Commit one completed call utterance through Arrakis' canonical audio ingress.
 *
 * The recognized text remains an internal input to the same chat cognition and
 * memory owner.  This boundary deliberately returns no transcript, reply text,
 * legacy `voice_audio`, or TTS blob to the call screen.  Audible presentation is
 * resolved from the committed assistant turn by `nativeCallVoiceService`.
 */
export async function sendCanonicalCallTurn(
  audio: Blob,
  sessionId: string,
  callId: string,
): Promise<CanonicalCallTurn> {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  if (!audio.size || audio.size > 4 * 1024 * 1024) {
    throw new Error("AUDIO_INPUT_SIZE_INVALID");
  }
  if (!sessionId.trim() || !callId.trim()) {
    throw new Error("AUDIO_CALL_BINDING_INVALID");
  }
  const clientMessageId = crypto.randomUUID();
  const query = new URLSearchParams({
    session_id: sessionId,
    client_message_id: clientMessageId,
    language: "it",
    call_id: callId,
  });
  const response = await apiRequest<Record<string, unknown>>(
    `/audio/notes?${query.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": audio.type || "application/octet-stream",
      },
      body: audio,
      timeout: 420_000,
    },
  );
  const assistantTurnId = Number(response.assistant_turn_id);
  if (!Number.isSafeInteger(assistantTurnId) || assistantTurnId < 1) {
    throw new Error("AUDIO_CALL_ASSISTANT_TURN_MISSING");
  }
  return {
    assistantTurnId,
    exchangeId: typeof response.exchange_id === "string" ? response.exchange_id : undefined,
  };
}

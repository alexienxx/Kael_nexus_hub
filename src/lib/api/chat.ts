import { apiRequest, apiUpload } from "./client";
import type { ChatMessage, FeedbackPayload } from "@/types";

/**
 * CHAT API SERVICE LAYER
 *
 * NOTE: The following endpoints are assumed based on frontend needs
 * and require verification with the actual Kael_refactor_ultimate backend:
 *
 * - POST /chat
 * - POST /chat/regenerate
 * - POST /feedback
 * - POST /chat/image
 * - POST /chat/voice
 * - GET /chat/history
 * - GET /chat/pending
 *
 * These endpoints may need alignment if the backend contracts differ.
 * Current implementations reflect best-guess contracts pending backend verification.
 */

export interface ChatResponse {
  turn_id: string;
  content: string;
  meta?: Record<string, unknown>;
  tts_url?: string;
  // Sender information for multi-agent conversations
  sender?: "user" | "kael" | "external_agent";
  agent_id?: string;
  agent_name?: string;
  agent_avatar?: string;
}

export interface VoiceResponse extends ChatResponse {
  transcription?: string;
}

/** Send a text message and get Kael's reply */
export async function sendMessage(
  text: string,
  sessionId: string,
  conversationId?: string
) {
  return apiRequest<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({ message: text, session_id: sessionId, conversationId }),
  });
}

/** Regenerate last Kael response */
export async function regenerateResponse(turnId: string, sessionId: string) {
  return apiRequest<ChatResponse>("/chat/regenerate", {
    method: "POST",
    body: JSON.stringify({ turn_id: turnId, session_id: sessionId }),
  });
}

/** Submit RLHF feedback (like/dislike) */
export async function submitFeedback(
  turnId: string,
  type: "like" | "dislike"
) {
  return apiRequest("/feedback", {
    method: "POST",
    body: JSON.stringify({ turn_id: turnId, type }),
  });
}

/** Upload an image in chat (Kael can analyze it via backend vision) */
export async function sendImage(
  file: File,
  sessionId: string,
  conversationId?: string
) {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("session_id", sessionId);
  if (conversationId) formData.append("conversationId", conversationId);
  return apiUpload<ChatResponse>("/chat/image", formData);
}

/** Send a voice note and get Kael's reply */
export async function sendVoiceNote(audioBlob: Blob, sessionId: string) {
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice-note.webm");
  formData.append("session_id", sessionId);
  return apiUpload<VoiceResponse>("/chat/voice", formData);
}

/** Get chat history */
export async function getChatHistory(sessionId: string, conversationId?: string) {
  const params = new URLSearchParams({ session_id: sessionId });
  if (conversationId) params.append("conversationId", conversationId);
  return apiRequest<{ messages: ChatMessage[] }>(`/chat/history?${params}`);
}

/** Get pending/autonomous messages from Kael */
export async function getPendingMessages(sessionId: string) {
  return apiRequest<{ messages: ChatMessage[] }>(
    `/chat/pending?session_id=${sessionId}`
  );
}

/**
 * NOTE: For TTS functionality, use requestTTS from @/lib/api/voice
 * That function uses GET /voice/tts and returns audio Blob directly.
 */

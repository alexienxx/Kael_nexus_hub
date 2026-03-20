import { apiRequest, apiUpload } from "./client";
import type { ChatMessage, FeedbackPayload } from "@/types";

/**
 * CHAT API SERVICE LAYER
 *
 * VERIFIED ENDPOINTS (in active use):
 * - POST /chat - Send text message and get reply
 * - POST /chat/regenerate - Regenerate last response
 * - POST /feedback - Submit RLHF feedback
 * - POST /chat/image - Upload image for analysis
 * - POST /chat/voice - Send voice note
 * - GET /chat/history - Get message history (defined but not actively used in UI)
 *
 * REALTIME BEHAVIOR:
 * - APK uses request-response pattern ONLY
 * - NO polling, SSE, or WebSocket for chat messages
 * - WebSocket only used for voice call transcription (see voice.ts)
 *
 * See APK_CHAT_BEHAVIOR.md for complete verification audit.
 */

export interface ChatResponse {
  reply: string;
  session_id: string;
  message_id?: string;
  message_type?: string;
  assistant_turn_id?: number;
  voice_audio?: string;
  voice_used?: boolean;
  voice_reason?: string;
  typing_delay_ms?: number;
  bubbles?: string[];
  image_base64?: string;
  image_mime?: string;
  meta?: Record<string, unknown>;
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
    body: JSON.stringify({ text, session_id: sessionId }),
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
  return apiRequest<{ messages: ChatMessage[] }>(`/chat/history/messages?${params}`);
}

/**
 * NOTE: For TTS functionality, use requestTTS from @/lib/api/voice
 * That function uses GET /voice/tts and returns audio Blob directly.
 */

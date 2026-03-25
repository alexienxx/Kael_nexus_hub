import { apiRequest, apiUpload, ensureBackendAlive } from "./client";
import type { ChatMessage, FeedbackPayload } from "@/types";

/**
 * CHAT API SERVICE LAYER
 *
 * VERIFIED ENDPOINTS (in active use):
 * - POST /chat - Send text message and get reply
 * - POST /feedback - Submit RLHF feedback
 * - POST /chat/image - Upload image for analysis
 * - POST /chat/voice - Send voice note
 * - GET /chat/history/messages - Load full chat history
 * - GET /chat/history/pending - Fetch new messages after timestamp (SSE catch-up)
 *
 * REALTIME BEHAVIOR:
 * - User-initiated chat: request-response pattern (POST /chat → response)
 * - Autonomous messages: SSE push via GET /chat/events (see lib/api/sse.ts)
 * - On SSE "new_message" event: fetch full content via /chat/history/pending
 * - WebSocket only used for voice call transcription (see voice.ts)
 * - NO polling. SSE is the single realtime channel.
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
  // Avatar video: present when user requested a video message.
  // Job is async (CPU-heavy render). Poll /avatar/live/video/{id} until done,
  // then fetch /avatar/live/video/{id}/base64 for the MP4 data URL.
  // See src/lib/api/avatar.ts fetchAvatarVideo().
  avatar_job_id?: string;
}

export interface VoiceResponse extends ChatResponse {
  transcription?: string;
}

/**
 * Timeout for LLM-backed requests (chat, voice).
 * Ollama inference + TTS can take 60-120s depending on model load and voice synthesis.
 */
const CHAT_TIMEOUT = 180_000;

/** Send a text message and get Kael's reply */
export async function sendMessage(
  text: string,
  sessionId: string,
  conversationId?: string
) {
  return apiRequest<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({ text, session_id: sessionId }),
    timeout: CHAT_TIMEOUT,
  });
}

/** Submit RLHF feedback (like/dislike) */
export async function submitFeedback(
  turnId: string,
  type: "like" | "dislike"
): Promise<{ ok: boolean; cap_reached: boolean; feedback_count: number; score: number }> {
  return apiRequest("/feedback", {
    method: "POST",
    // Backend FeedbackRequest model uses "feedback_type", not "type"
    body: JSON.stringify({ turn_id: turnId, feedback_type: type }),
  });
}

/** Upload an image in chat (Kael can analyze it via backend vision) */
export async function sendImage(
  file: File,
  sessionId: string,
  conversationId?: string
) {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  const formData = new FormData();
  formData.append("image", file);
  formData.append("session_id", sessionId);
  if (conversationId) formData.append("conversationId", conversationId);
  return apiUpload<ChatResponse>("/chat/image", formData);
}

/** Send a voice note and get Kael's reply */
export async function sendVoiceNote(audioBlob: Blob, sessionId: string) {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice-note.webm");
  formData.append("session_id", sessionId);
  return apiUpload<VoiceResponse>("/chat/voice", formData, { timeout: CHAT_TIMEOUT });
}

/** Get chat history */
export async function getChatHistory(sessionId: string, conversationId?: string) {
  const params = new URLSearchParams({ session_id: sessionId });
  if (conversationId) params.append("conversationId", conversationId);
  return apiRequest<{ messages: ChatMessage[] }>(`/chat/history/messages?${params}`);
}

/**
 * Fetch new messages since a given timestamp.
 *
 * Used by Chat.tsx when SSE fires "new_message" — this fetches the FULL
 * message content (SSE only carries a 120-char preview).
 *
 * Endpoint: GET /chat/history/pending?after_ts=<unix_ts>
 *   - after_ts: exclusive Unix timestamp (seconds)
 *   - exclude_client: defaults to "mobile" (prevents echo of own user messages)
 *   - Returns: { messages: [...] } with full message objects
 */
export async function fetchPendingMessages(afterTs: number, sessionId: string) {
  const params = new URLSearchParams({
    after_ts: String(afterTs),
    session_id: sessionId,
  });
  return apiRequest<{ messages: any[] }>(`/chat/history/pending?${params}`);
}

/**
 * NOTE: For TTS functionality, use requestTTS from @/lib/api/voice
 * That function uses GET /voice/tts and returns audio Blob directly.
 */

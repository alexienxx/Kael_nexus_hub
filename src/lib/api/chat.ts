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
  id?: string;
  backend_turn_id?: string | number;
  message_id?: string;
  trace_id?: string;
  request_id?: string;
  created_at?: number | string;
  server_created_at?: string;
  timestamp?: number;
  /** Echo of the client_message_id sent in the request — used for reconciliation. */
  client_message_id?: string;
  message_type?: string;
  assistant_turn_id?: number;
  user_turn_id?: number;
  voice_audio?: string;
  /** Persistent voice URL — backend serves WAV via /voice/audio/{trace_id}.
   *  Survives reload (chat path). Preferred over ephemeral voice_audio b64. */
  tts_url?: string;
  /** Future-ready field for autonomous voice notes (asset-store backed).
   *  Currently unused in production (autonomy voice path is gated off);
   *  declared here so the APK fallback chain is forward-compatible. */
  voice_asset_id?: string;
  /** True when backend persisted a WAV file on disk for this turn. */
  has_voice_audio?: boolean;
  voice_used?: boolean;
  voice_reason?: string;
  typing_delay_ms?: number;
  bubbles?: string[];
  image_base64?: string;
  image_mime?: string;
  image_asset_id?: string;
  /** Canonical delivery mode: "text" | "voice_note" | "image" | "video_message" | "voice_call" */
  delivery_mode?: string;
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
  // Vision
  vision_ok?: boolean;
  failure_kind?: string;
}

export interface VoiceResponse extends ChatResponse {
  transcription?: string;
}

export type QuotedMessageAuthor = "user" | "assistant" | "autonomous" | "system" | "tool";

export interface QuotedMessagePayload {
  quoted_message_id: string;
  quoted_turn_id: string | null;
  quoted_session_id: string;
  quoted_author: QuotedMessageAuthor;
  quoted_channel: "chat" | "autonomy" | "voice" | "image" | "call" | "other";
  quoted_created_at: string;
  quoted_text_preview: string;
  quoted_text_hash: string | null;
  quoted_full_text_available: boolean;
  quoted_autonomy_id: string | null;
  quoted_parent_message_id: string | null;
  quoted_topic_id: string | null;
  quoted_memory_candidate: boolean | null;
}

/**
 * Timeout for LLM-backed requests (chat, voice).
 * Ollama inference + TTS can take 60-180s for long replies.
 * Set to 7min to avoid killing long responses when connected via USB/adb-reverse.
 */
const CHAT_TIMEOUT = 420_000;

/** Send a text message and get Kael's reply */
export async function sendMessage(
  text: string,
  sessionId: string,
  conversationId?: string,
  clientMessageId?: string,
) {
  return apiRequest<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({
      text,
      session_id: sessionId,
      client_time: new Date().toISOString(),
      // Stable client-generated UUID for server-side idempotency and
      // frontend reconciliation of the optimistic message on history reload.
      ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
    }),
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
  text?: string,
) {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  const formData = new FormData();
  formData.append("image", file);
  formData.append("session_id", sessionId);
  formData.append("client_time", new Date().toISOString());
  if (text && text.trim()) formData.append("text", text.trim());
  return apiUpload<ChatResponse>("/chat/image", formData, { timeout: CHAT_TIMEOUT });
}

/** Upload wallpaper image for Kael to analyse and use as chat context */
export async function sendWallpaper(
  file: File,
  sessionId: string,
  mode: "share_once" | "persistent_context",
) {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  const formData = new FormData();
  formData.append("image", file);
  formData.append("session_id", sessionId);
  formData.append("mode", mode);
  return apiUpload<import("@/types/wallpaper").WallpaperAnalysisResponse>(
    "/chat/wallpaper",
    formData,
    { timeout: CHAT_TIMEOUT },
  );
}

/** Send a voice note and get Kael's reply */
export async function sendVoiceNote(audioBlob: Blob, sessionId: string, clientMessageId: string) {
  if (!(await ensureBackendAlive())) {
    throw new Error("Backend non raggiungibile — riprova tra poco");
  }
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice-note.webm");
  formData.append("session_id", sessionId);
  formData.append("client_message_id", clientMessageId);
  formData.append("client_time", new Date().toISOString());
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

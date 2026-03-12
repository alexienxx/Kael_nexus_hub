import { apiRequest, apiUpload } from "./client";
import type { ChatMessage, FeedbackPayload } from "@/types";

/** Send a text message and get Kael's reply */
export async function sendMessage(text: string, conversationId?: string) {
  return apiRequest<{ message: ChatMessage }>("/chat/send", {
    method: "POST",
    body: JSON.stringify({ text, conversationId }),
  });
}

/** Regenerate last Kael response */
export async function regenerateResponse(messageId: string) {
  return apiRequest<{ message: ChatMessage }>("/chat/regenerate", {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
}

/** Submit RLHF feedback (like/dislike) */
export async function submitFeedback(payload: FeedbackPayload) {
  return apiRequest("/chat/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Upload an image in chat (Kael can analyze it via backend vision) */
export async function sendImage(file: File, conversationId?: string) {
  const formData = new FormData();
  formData.append("image", file);
  if (conversationId) formData.append("conversationId", conversationId);
  return apiUpload<{ message: ChatMessage }>("/chat/image", formData);
}

/** Get chat history */
export async function getChatHistory(conversationId?: string) {
  const query = conversationId ? `?conversationId=${conversationId}` : "";
  return apiRequest<{ messages: ChatMessage[] }>(`/chat/history${query}`);
}

/** Get pending/autonomous messages from Kael */
export async function getPendingMessages() {
  return apiRequest<{ messages: ChatMessage[] }>("/chat/pending");
}

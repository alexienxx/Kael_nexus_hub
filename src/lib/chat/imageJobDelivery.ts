import type { ChatMessage } from "@/types";
import type { ImageGenerationJobReceipt } from "@/lib/api/imageJobs";
import { imageGenerationJobIdFromMeta } from "@/lib/api/imageJobs";

export type ImageGenerationClientState =
  | ImageGenerationJobReceipt["status"]
  | "POLL_EXHAUSTED"
  | "POLL_ERROR";

export function withImageGenerationClientState(
  message: ChatMessage,
  state: ImageGenerationClientState,
): ChatMessage {
  return {
    ...message,
    meta: {
      ...(message.meta ?? {}),
      image_generation_client_state: state,
    },
  };
}

/**
 * Promote a committed job to durable gallery identity. Any display URL or
 * base64 value is removed so the caller must mint a fresh scoped gallery URL.
 */
export function applyImageJobReceipt(
  message: ChatMessage,
  expectedJobId: string,
  receipt: ImageGenerationJobReceipt,
): ChatMessage {
  if (imageGenerationJobIdFromMeta(message.meta) !== expectedJobId) return message;
  if (receipt.status !== "COMMITTED" && receipt.status !== "DELIVERED") {
    return withImageGenerationClientState(message, receipt.status);
  }
  return {
    ...message,
    image: undefined,
    imageAssetId: receipt.asset_id,
    meta: {
      ...(message.meta ?? {}),
      image_generation_client_state: receipt.status,
    },
  };
}

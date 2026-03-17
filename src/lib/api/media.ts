import { apiRequest } from "./client";
import type { MediaItem } from "@/types";

/**
 * MEDIA API SERVICE LAYER
 *
 * Endpoints:
 * - GET /media/gallery — shared media gallery (photos, videos, audio)
 * - POST /media/video/request — request avatar video from Kael
 * - GET /media/video/status — check avatar video generation status
 * - GET /media/generated — get generated images
 *
 * ⚠️ NO /spotify/* endpoints here — see spotify.ts for Spotify contract
 */

/** Get shared media gallery */
export async function getMediaGallery(type?: "image" | "video" | "audio") {
  const query = type ? `?type=${type}` : "";
  return apiRequest<{ items: MediaItem[] }>(`/media/gallery${query}`);
}

/** Request an avatar video from Kael */
export async function requestAvatarVideo(prompt?: string) {
  return apiRequest<{ videoId: string; status: string }>("/media/video/request", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

/** Check avatar video generation status */
export async function checkVideoStatus(videoId: string) {
  return apiRequest<{ status: string; url?: string }>(
    `/media/video/status?videoId=${videoId}`
  );
}

/** Get generated images */
export async function getGeneratedImages() {
  return apiRequest<{ items: MediaItem[] }>("/media/generated");
}

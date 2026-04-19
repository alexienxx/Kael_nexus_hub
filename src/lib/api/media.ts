import { apiRequest, getApiConfig } from "./client";
import type { MediaItem } from "@/types";

/**
 * MEDIA API SERVICE LAYER
 *
 * Endpoints (real backend):
 * - GET  /media/gallery             — list gallery items (photos, videos)
 * - GET  /media/gallery/{id}/file   — serve actual file
 * - GET  /media/gallery/{id}/thumbnail — serve thumbnail
 * - POST /media/gallery             — save media to gallery (base64)
 * - DELETE /media/gallery/{id}      — remove item
 * - POST /avatar/live/video/render  — request avatar video from Kael
 * - GET  /avatar/live/video/{jobId} — check avatar video status
 * - GET  /avatar/live/video/{jobId}/base64 — get rendered video
 *
 * ⚠️ NO /spotify/* endpoints here — see spotify.ts for Spotify contract
 */

export interface GalleryListResponse {
  ok: boolean;
  items: GalleryApiItem[];
  total: number;
}

export interface GalleryApiItem {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnail: string | null;
  prompt: string | null;
  caption: string | null;
  source: string;
  size_bytes: number;
  created_at: string;
  session_id: string;
}

/** List gallery items from backend */
export async function getMediaGallery(type?: "image" | "video") {
  const query = type ? `?type=${type}` : "";
  return apiRequest<GalleryListResponse>(`/media/gallery${query}`);
}

/** Save media to gallery (base64 input) */
export async function saveToGallery(params: {
  type: "image" | "video";
  data_b64: string;
  prompt?: string;
  caption?: string;
  source?: string;
}) {
  return apiRequest<{ ok: boolean; item: GalleryApiItem }>("/media/gallery", {
    method: "POST",
    body: JSON.stringify({
      type: params.type,
      data_b64: params.data_b64,
      prompt: params.prompt || null,
      caption: params.caption || null,
      source: params.source || "user_save",
    }),
  });
}

/** Delete a gallery item */
export async function deleteGalleryItem(id: string) {
  return apiRequest<{ ok: boolean }>(`/media/gallery/${id}`, {
    method: "DELETE",
  });
}

/**
 * Resolve a gallery asset ID to a usable image URL.
 * The backend serves the file at /media/gallery/{id}/file.
 * Returns the full URL string (not a data URL — lets the browser stream it).
 */
export function getGalleryFileUrl(assetId: string): string {
  const config = getApiConfig();
  if (!config.baseUrl) return "";
  return `${config.baseUrl.replace(/\/$/, "")}/media/gallery/${assetId}/file`;
}

/** Request an avatar video from Kael */
export async function requestAvatarVideo(text?: string) {
  return apiRequest<{ job_id: string; status: string }>("/avatar/live/video/render", {
    method: "POST",
    body: JSON.stringify({ text: text || "Ciao, sono Kael!" }),
  });
}

/** Check avatar video generation status */
export async function checkVideoStatus(jobId: string) {
  return apiRequest<{ job_id: string; status: string; error?: string }>(
    `/avatar/live/video/${jobId}`
  );
}

/** Get rendered video as base64 */
export async function getVideoBase64(jobId: string) {
  return apiRequest<{ job_id: string; video_base64: string }>(
    `/avatar/live/video/${jobId}/base64`
  );
}

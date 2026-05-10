/**
 * Reference photos API — Kael & Alexièn authorized identity store.
 *
 * ⚠️  AUTHORIZED USE ONLY ⚠️
 * This module feeds the local reference-image store used for personalized
 * image generation (LoRA, IP-Adapter, img2img, etc.) for TWO authorized
 * identities: "kael" and "alexien".
 *
 * DO NOT generalize this to third-party face upload, recognition, or
 * reproduction without explicit consent and re-evaluation. The backend
 * enforces _ALLOWED_IDENTITIES = {"kael", "alexien"} and will reject
 * any other identity at the filesystem level.
 *
 * Backend source: kael_refactor/services/multimodal/photo_container.py
 * Disk path:      state/vision/photo_container/{kael|alexien}/
 */

import { apiRequest, apiUpload, getApiConfig } from "./client";

export type AuthorizedIdentity = "kael" | "alexien";

export function identityDisplayName(identity: AuthorizedIdentity): string {
  return identity === "alexien" ? "Alexièn" : "Kael";
}

export interface ContainerPhoto {
  identity: AuthorizedIdentity;
  canonical_identity: AuthorizedIdentity;
  display_name: string;
  source: "apk_upload" | "existing_state" | "imported_reference";
  name: string;
  bytes: number;
  sha256: string;
  created_at: string;
  modified_at: string; // ISO-8601 UTC
  updated_at: string;
  file_path: string;
  source_of_truth_path: string;
}

export interface ListPhotosResponse {
  ok: boolean;
  identity: AuthorizedIdentity;
  count: number;
  items: ContainerPhoto[];
  source_of_truth_path?: string | null;
}

export interface UploadPhotoResponse {
  ok: boolean;
  photo: ContainerPhoto;
}

/**
 * List reference photos for one authorized identity.
 */
export async function listReferencePhotos(
  identity: AuthorizedIdentity,
  limit = 200
): Promise<ListPhotosResponse> {
  return apiRequest<ListPhotosResponse>(
    `/multimodal/photos/list?identity=${encodeURIComponent(identity)}&limit=${limit}`
  );
}

/**
 * Upload one reference photo for an authorized identity.
 * Sends file as multipart/form-data to the backend photo container.
 */
export async function uploadReferencePhoto(
  identity: AuthorizedIdentity,
  file: File
): Promise<UploadPhotoResponse> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("identity", identity);
  fd.append("filename", file.name);
  return apiUpload<UploadPhotoResponse>("/multimodal/photos/upload", fd);
}

/**
 * Delete one reference photo from the authorized identity store.
 */
export async function deleteReferencePhoto(
  identity: AuthorizedIdentity,
  name: string
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/multimodal/photos/file/${encodeURIComponent(identity)}/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
}

/**
 * Build the direct URL for displaying a reference photo thumbnail.
 * Returns null if the backend URL is not configured.
 */
export function referencePhotoUrl(
  identity: AuthorizedIdentity,
  name: string
): string | null {
  const config = getApiConfig();
  if (!config.baseUrl) return null;
  const base = config.baseUrl.replace(/\/$/, "");
  return `${base}/multimodal/photos/file/${encodeURIComponent(identity)}/${encodeURIComponent(name)}`;
}

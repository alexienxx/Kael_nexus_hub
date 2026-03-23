import { apiRequest, getApiConfig } from "./client";

/**
 * AVATAR VIDEO API SERVICE LAYER (LivePortrait ONNX engine)
 *
 * VERIFIED BACKEND ENDPOINTS (prefix: /avatar/live):
 * - GET  /avatar/live/health                → engine status
 * - POST /avatar/live/video/render          → render text → animated avatar MP4
 * - GET  /avatar/live/video/{job_id}        → poll render job status
 * - GET  /avatar/live/video/{job_id}/base64 → get rendered video as base64
 * - POST /avatar/live/stream/start          → start MJPEG live stream (video calls)
 * - POST /avatar/live/stream/stop           → stop MJPEG live stream
 * - GET  /avatar/live/stream                → MJPEG stream (multipart/x-mixed-replace)
 *
 * NOTE: Avatar requires KAEL_AVATAR_ENABLED=1 on backend.
 *       If disabled, endpoints return HTTP 503.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AvatarHealthStatus {
  ok: boolean;
  engine: string;
  models_found: number;
  models_missing: string[];
  model_dir: string;
  reference_loaded: boolean;
  avatar_enabled: boolean;
  error?: string;
}

export interface VideoRenderJob {
  job_id: string;
  status: "rendering" | "done" | "error";
  duration_ms: number;
  frames_rendered: number;
  file_size_bytes: number;
  error: string | null;
  created_at?: string;
  completed_at?: string;
}

export interface VideoBase64Response {
  job_id: string;
  video_base64: string;
  duration_ms: number;
  file_size_bytes: number;
}

export interface StreamControlResponse {
  ok: boolean;
  status: string;
  fps?: number;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Check LivePortrait engine status */
export async function getAvatarHealth(): Promise<AvatarHealthStatus> {
  return apiRequest<AvatarHealthStatus>("/avatar/live/health");
}

// ---------------------------------------------------------------------------
// Video render (for chat messages — async job)
// ---------------------------------------------------------------------------

/** Request a rendered avatar video message (text → TTS → animation → MP4) */
export async function renderAvatarVideo(
  text: string,
  emotionLabel: string = "neutral",
  sessionId: string = "default",
  fps: number = 25,
  maxDurationS: number = 60.0,
): Promise<VideoRenderJob> {
  return apiRequest<VideoRenderJob>("/avatar/live/video/render", {
    method: "POST",
    body: JSON.stringify({
      text,
      emotion_label: emotionLabel,
      session_id: sessionId,
      fps,
      max_duration_s: maxDurationS,
    }),
  });
}

/** Poll render job status */
export async function getVideoJobStatus(jobId: string): Promise<VideoRenderJob> {
  return apiRequest<VideoRenderJob>(`/avatar/live/video/${jobId}`);
}

/** Fetch rendered video as base64-encoded MP4 (only when job.status === "done") */
export async function fetchAvatarVideo(jobId: string): Promise<VideoBase64Response> {
  return apiRequest<VideoBase64Response>(`/avatar/live/video/${jobId}/base64`);
}

// ---------------------------------------------------------------------------
// MJPEG live stream (for video calls)
// ---------------------------------------------------------------------------

/** Start live MJPEG avatar stream (emotion-driven) */
export async function startAvatarStream(
  emotionLabel: string = "neutral",
  fps: number = 15,
): Promise<StreamControlResponse> {
  return apiRequest<StreamControlResponse>("/avatar/live/stream/start", {
    method: "POST",
    body: JSON.stringify({ emotion_label: emotionLabel, fps }),
  });
}

/** Stop live MJPEG avatar stream */
export async function stopAvatarStream(): Promise<StreamControlResponse> {
  return apiRequest<StreamControlResponse>("/avatar/live/stream/stop", {
    method: "POST",
  });
}

/**
 * Get the MJPEG stream URL for direct use in <img> tags.
 *
 * Usage in React:
 *   <img src={getAvatarStreamUrl()} alt="Kael avatar" />
 *
 * The stream returns multipart/x-mixed-replace JPEG frames.
 */
export function getAvatarStreamUrl(): string {
  const config = getApiConfig();
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  return `${baseUrl}/avatar/live/stream`;
}

import { ApiError, ApiProtocolError, apiRequest } from "./client";

export type ImageGenerationJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "GENERATED"
  | "ANALYZED"
  | "COMMITTED"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

export interface ImageGenerationJobReceipt {
  job_id: string;
  status: ImageGenerationJobStatus;
  asset_id: string;
  created_at: string;
  updated_at: string;
  error_stage: string;
  error_type: string;
  vision_model: string;
}

interface ImageGenerationJobEnvelope {
  ok: boolean;
  job: ImageGenerationJobReceipt;
}

const JOB_STATUSES = new Set<ImageGenerationJobStatus>([
  "QUEUED",
  "RUNNING",
  "GENERATED",
  "ANALYZED",
  "COMMITTED",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
]);

const DURABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function canonicalDurableId(value: string, label: string, maxLength = 256): string {
  const normalized = String(value ?? "").trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    !DURABLE_ID_PATTERN.test(normalized)
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function canonicalAssetId(value: string): string {
  return canonicalDurableId(value, "gallery asset ID", 128);
}

/** Read only the canonical job reference carried by assistant metadata. */
export function imageGenerationJobIdFromMeta(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  if (typeof meta?.image_generation_job_id !== "string") return undefined;
  try {
    return canonicalDurableId(
      meta.image_generation_job_id,
      "image generation job ID",
    );
  } catch {
    return undefined;
  }
}

function parseJobEnvelope(
  payload: ImageGenerationJobEnvelope,
  expectedJobId: string,
): ImageGenerationJobReceipt {
  const job = payload?.job;
  if (
    payload?.ok !== true ||
    !job ||
    job.job_id !== expectedJobId ||
    !JOB_STATUSES.has(job.status)
  ) {
    throw new ApiProtocolError("invalid_json");
  }
  if (job.asset_id) canonicalAssetId(job.asset_id);
  if (
    (job.status === "COMMITTED" || job.status === "DELIVERED") &&
    !job.asset_id
  ) {
    throw new ApiProtocolError("invalid_json");
  }
  return job;
}

/** Read the prompt-free, authenticated projection of one session-owned job. */
export async function getImageGenerationJob(
  jobId: string,
  sessionId: string,
): Promise<ImageGenerationJobReceipt> {
  const canonicalJobId = canonicalDurableId(jobId, "image generation job ID");
  const canonicalSessionId = canonicalDurableId(sessionId, "session ID");
  const payload = await apiRequest<ImageGenerationJobEnvelope>(
    `/vision/jobs/${encodeURIComponent(canonicalJobId)}?session_id=${encodeURIComponent(canonicalSessionId)}`,
    { timeout: 15_000 },
  );
  return parseJobEnvelope(payload, canonicalJobId);
}

/** Record that the exact committed gallery asset was displayed by an image element. */
export async function acknowledgeImageGenerationDelivered(
  jobId: string,
  sessionId: string,
  assetId: string,
): Promise<ImageGenerationJobReceipt> {
  const canonicalJobId = canonicalDurableId(jobId, "image generation job ID");
  const canonicalSessionId = canonicalDurableId(sessionId, "session ID");
  const canonicalAsset = canonicalAssetId(assetId);
  const payload = await apiRequest<ImageGenerationJobEnvelope>(
    `/vision/jobs/${encodeURIComponent(canonicalJobId)}/delivered`,
    {
      method: "POST",
      body: JSON.stringify({
        session_id: canonicalSessionId,
        asset_id: canonicalAsset,
      }),
      timeout: 15_000,
    },
  );
  const receipt = parseJobEnvelope(payload, canonicalJobId);
  if (receipt.status !== "DELIVERED" || receipt.asset_id !== canonicalAsset) {
    throw new ApiProtocolError("invalid_json");
  }
  return receipt;
}

export interface ImageJobPollingOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function isRetryablePollingError(error: unknown): boolean {
  return !(error instanceof ApiProtocolError) &&
    (!(error instanceof ApiError) || error.status >= 500 || error.status === 429);
}

/**
 * Poll with a finite exponential backoff budget. COMMITTED/DELIVERED carry the
 * durable asset identity; FAILED/CANCELLED stop without attempting delivery.
 * A null result means the bounded attempt budget elapsed.
 */
export async function pollImageGenerationJob(
  jobId: string,
  sessionId: string,
  options: ImageJobPollingOptions = {},
): Promise<ImageGenerationJobReceipt | null> {
  const maxAttempts = boundedPositiveInteger(options.maxAttempts, 30);
  const initialDelayMs = boundedPositiveInteger(options.initialDelayMs, 1_000);
  const maxDelayMs = boundedPositiveInteger(options.maxDelayMs, 10_000);
  const sleep = options.sleep ?? abortableSleep;
  let delayMs = Math.min(initialDelayMs, maxDelayMs);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const receipt = await getImageGenerationJob(jobId, sessionId);
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (
        receipt.status === "COMMITTED" ||
        receipt.status === "DELIVERED" ||
        receipt.status === "FAILED" ||
        receipt.status === "CANCELLED"
      ) {
        return receipt;
      }
    } catch (error) {
      if (options.signal?.aborted || !isRetryablePollingError(error)) throw error;
    }

    if (attempt + 1 < maxAttempts) {
      await sleep(delayMs, options.signal);
      delayMs = Math.min(maxDelayMs, Math.ceil(delayMs * 1.5));
    }
  }
  return null;
}

/**
 * A single chat mount may receive repeated DOM load events for the same URL.
 * Mark before the request so concurrent load events still issue one ACK.
 */
export function createImageDeliveryAcknowledger() {
  const attempted = new Set<string>();
  return async (jobId: string, sessionId: string, assetId: string): Promise<boolean> => {
    const key = `${sessionId}\u0000${jobId}\u0000${assetId}`;
    if (attempted.has(key)) return false;
    attempted.add(key);
    await acknowledgeImageGenerationDelivered(jobId, sessionId, assetId);
    return true;
  };
}

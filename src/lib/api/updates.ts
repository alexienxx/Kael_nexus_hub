/**
 * Remote update service for sideloaded APK distribution.
 * Checks a remote manifest (JSON file or backend endpoint) for new versions.
 */

import { APP_VERSION, APP_VERSION_CODE } from "@/lib/constants";

export interface UpdateManifest {
  app_name: string;
  latest_version: string;
  version_code: number;
  apk_url: string;
  changelog: string[];
  force_update: boolean;
  published_at: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  currentVersionCode: number;
  manifest: UpdateManifest | null;
}

const UPDATE_MANIFEST_URL_KEY = "kael-update-manifest-url";
const DEFAULT_MANIFEST_URL = "";

/** Get the configured manifest URL */
export function getManifestUrl(): string {
  try {
    return localStorage.getItem(UPDATE_MANIFEST_URL_KEY) || DEFAULT_MANIFEST_URL;
  } catch {
    return DEFAULT_MANIFEST_URL;
  }
}

/** Set the manifest URL */
export function setManifestUrl(url: string) {
  localStorage.setItem(UPDATE_MANIFEST_URL_KEY, url);
}

/** Fetch the remote update manifest */
export async function fetchUpdateManifest(): Promise<UpdateManifest> {
  const url = getManifestUrl();
  if (!url) {
    throw new Error("Update manifest URL not configured. Go to Settings → Updates.");
  }

  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch update manifest: ${res.status}`);
  }

  return res.json();
}

/** Compare version codes to determine if update is available */
export function isUpdateAvailable(manifest: UpdateManifest): boolean {
  return manifest.version_code > APP_VERSION_CODE;
}

/** Full update check flow */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const manifest = await fetchUpdateManifest();
    return {
      updateAvailable: isUpdateAvailable(manifest),
      currentVersion: APP_VERSION,
      currentVersionCode: APP_VERSION_CODE,
      manifest,
    };
  } catch (error) {
    console.error("[UpdateService] Check failed:", error);
    throw error;
  }
}

/**
 * Download APK from URL with progress tracking.
 * In a Capacitor/native context this would save to device storage
 * and trigger the Android install intent.
 * In web context, it triggers a browser download.
 */
export async function downloadApk(
  apkUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const res = await fetch(apkUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const contentLength = res.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!res.body) {
    // Fallback: simple download
    const blob = await res.blob();
    triggerBrowserDownload(blob, getFilenameFromUrl(apkUrl));
    onProgress?.(100);
    return;
  }

  const reader = res.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value.buffer as ArrayBuffer);
    received += value.length;
    if (total > 0) {
      onProgress?.(Math.round((received / total) * 100));
    }
  }

  const blob = new Blob(chunks, { type: "application/vnd.android.package-archive" });
  triggerBrowserDownload(blob, getFilenameFromUrl(apkUrl));
  onProgress?.(100);
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getFilenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split("/").pop() || "kael-companion.apk";
  } catch {
    return "kael-companion.apk";
  }
}

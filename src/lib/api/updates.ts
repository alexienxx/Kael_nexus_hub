/**
 * Remote update service for sideloaded APK distribution.
 * Checks the Kael backend's /app/update-check endpoint for new versions.
 *
 * WiFi in-app update is the canonical delivery path.
 * The manifest URL defaults to {backendBaseUrl}/app/update-check.
 * The APK download URL defaults to {backendBaseUrl}/app/download.
 */

import { APP_VERSION, APP_VERSION_CODE } from "@/lib/constants";
import { getApiConfig, parseStrictJsonBody, requestScopedResourceUrl } from "@/lib/api/client";
import { Capacitor } from "@capacitor/core";

export interface UpdateManifest {
  app_name: string;
  latest_version: string;
  version_name: string;
  version_code: number;
  apk_url: string;
  download_url: string;
  apk_filename: string;
  apk_sha256: string;
  apk_size_bytes: number;
  release_notes: string;
  changelog: string[];
  force_update: boolean;
  published_at: string;
  release_date: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  currentVersionCode: number;
  manifest: UpdateManifest | null;
}

const UPDATE_MANIFEST_URL_KEY = "kael-update-manifest-url";

/**
 * Get the manifest URL. Priority:
 * 1. User-configured override in localStorage
 * 2. Backend baseUrl + /app/update-check (canonical WiFi path)
 */
export function getManifestUrl(): string {
  try {
    const stored = localStorage.getItem(UPDATE_MANIFEST_URL_KEY);
    if (stored && stored.trim()) return stored;
  } catch { /* ignore */ }
  // Canonical: use backend baseUrl from config
  const config = getApiConfig();
  if (config.baseUrl) {
    return `${config.baseUrl.replace(/\/$/, "")}/app/update-check`;
  }
  return "";
}

/**
 * Get the APK download URL from the manifest (versioned) or fallback to /app/download.
 * Prefer calling getVersionedDownloadUrl(manifest) if you already have the manifest.
 */
export function getApkDownloadUrl(): string {
  const config = getApiConfig();
  if (config.baseUrl) {
    return `${config.baseUrl.replace(/\/$/, "")}/app/download`;
  }
  return "";
}

/**
 * Get the versioned download URL from a manifest response.
 * Falls back to /app/download if manifest doesn't include download_url.
 */
export function getVersionedDownloadUrl(manifest: UpdateManifest | null): string {
  if (manifest?.download_url) return manifest.download_url;
  if (manifest?.apk_url) return manifest.apk_url;
  return getApkDownloadUrl();
}

/** Set the manifest URL (user override from Settings) */
export function setManifestUrl(url: string) {
  localStorage.setItem(UPDATE_MANIFEST_URL_KEY, url);
}

/** Clear the manifest URL override (revert to backend default) */
export function clearManifestUrl() {
  localStorage.removeItem(UPDATE_MANIFEST_URL_KEY);
}

/** Fetch the remote update manifest */
export async function fetchUpdateManifest(): Promise<UpdateManifest> {
  const url = getManifestUrl();
  if (!url) {
    throw new Error("Backend URL non configurato. Vai in Impostazioni.");
  }

  const config = getApiConfig();
  const headers = new Headers({ "Accept": "application/json" });
  try {
    // Send the Kael credential only to the configured backend origin. A custom
    // manifest URL must never become a credential-exfiltration primitive.
    if (
      config.apiKey &&
      config.baseUrl &&
      new URL(url).origin === new URL(config.baseUrl).origin
    ) {
      headers.set("X-KAEL-KEY", config.apiKey);
    }
  } catch {
    // Invalid URLs are rejected by fetch; never attach a credential meanwhile.
  }

  const timeoutMs = 10_000;
  const hasNativeTimeout = typeof AbortSignal.timeout === "function";
  const controller = hasNativeTimeout ? undefined : new AbortController();
  const timer = hasNativeTimeout
    ? undefined
    : setTimeout(() => controller!.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers,
      signal: hasNativeTimeout ? AbortSignal.timeout(timeoutMs) : controller!.signal,
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Manifest non disponibile: ${res.status}`);
  }

  const data = parseStrictJsonBody<UpdateManifest>(await res.text());
  // Normalize backend manifest fields to match our interface
  return {
    ...data,
    latest_version: data.latest_version || data.version_name || "",
    // Prefer versioned download_url from server; fallback to static /app/download
    apk_url: data.download_url || data.apk_url || getApkDownloadUrl(),
    changelog: data.changelog || (data.release_notes ? [data.release_notes] : []),
    force_update: data.force_update ?? false,
    published_at: data.published_at || data.release_date || "",
  };
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
 * Silent boot check — returns result without throwing.
 * Used for automatic update check on app startup (after delay).
 */
export async function checkForUpdatesSilent(): Promise<UpdateCheckResult | null> {
  try {
    return await checkForUpdates();
  } catch {
    // Silent on boot: no toast, no error — just return null
    return null;
  }
}

/**
 * Download APK from URL.
 * On native Capacitor (Android), opens the download URL in the system browser
 * which triggers Android's download manager + APK install prompt.
 * On web/desktop, falls back to blob + <a> download trick.
 */
export async function downloadApk(
  apkUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  let transportUrl = apkUrl;
  const config = getApiConfig();
  try {
    const backend = new URL(config.baseUrl);
    const requested = new URL(apkUrl, backend);
    if (requested.origin === backend.origin) {
      if (requested.search || requested.hash) {
        throw new Error("Backend APK URL must not contain query or fragment data");
      }
      transportUrl = await requestScopedResourceUrl(requested.pathname);
    }
  } catch (error) {
    if (config.baseUrl) throw error;
  }

  // On native Android, delegate to system browser for proper APK install flow
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    // Dynamic import to avoid bundling Browser in web builds
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: transportUrl });
    onProgress?.(100);
    return;
  }

  // Web fallback: fetch + blob download
  const res = await fetch(transportUrl);
  if (!res.ok) throw new Error(`Download fallito: ${res.status}`);

  const contentLength = res.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!res.body) {
    const blob = await res.blob();
    triggerBrowserDownload(blob, "kael-companion.apk");
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
  triggerBrowserDownload(blob, "kael-companion.apk");
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

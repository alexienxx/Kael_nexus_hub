/**
 * Remote update service for sideloaded APK distribution.
 * Checks the Kael backend's /app/update-check endpoint for new versions.
 *
 * The configured backend publishes the release; Android owns background installation.
 * The manifest URL defaults to {backendBaseUrl}/app/update-check.
 * The APK download URL defaults to {backendBaseUrl}/app/download.
 */

import { APP_NAME, APP_VERSION, APP_VERSION_CODE } from "@/lib/constants";
import { getApiConfig, requestScopedResourceUrl } from "@/lib/api/client";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

const MAX_APK_BYTES = 128 * 1024 * 1024;

export interface InstalledAppVersion {
  version: string;
  versionCode: number;
  source: "installed" | "web_bundle";
}

export function parseInstalledAppVersion(info: { version: unknown; build: unknown }): InstalledAppVersion {
  if (typeof info.version !== "string" || !info.version || info.version.length > 128
    || typeof info.build !== "string" || !/^[1-9]\d*$/.test(info.build)
    || !Number.isSafeInteger(Number(info.build))) throw new Error("UPDATE_INSTALLED_VERSION_UNAVAILABLE");
  return { version: info.version, versionCode: Number(info.build), source: "installed" };
}

/** Native package metadata is authoritative; bundle constants are web-only. */
export async function readInstalledAppVersion(): Promise<InstalledAppVersion> {
  if (!Capacitor.isNativePlatform()) return { version: APP_VERSION, versionCode: APP_VERSION_CODE, source: "web_bundle" };
  try { return parseInstalledAppVersion(await CapacitorApp.getInfo()); }
  catch { throw new Error("UPDATE_INSTALLED_VERSION_UNAVAILABLE"); }
}

export function validateUpdateUrl(value: string, backendBaseUrl: string, kind: "manifest" | "apk"): URL {
  let backend: URL, url: URL;
  try { backend = new URL(backendBaseUrl); url = new URL(value, backend); }
  catch { throw new Error("UPDATE_URL_INVALID"); }
  if (!["http:", "https:"].includes(backend.protocol) || backend.username || backend.password
    || url.origin !== backend.origin || url.username || url.password || url.search || url.hash
    || (kind === "manifest" ? url.pathname !== "/app/update-check"
      : !/^\/app\/download(?:\/kael-\d+-[a-f0-9]+\.apk)?$/.test(url.pathname))) {
    throw new Error("UPDATE_URL_NOT_TRUSTED");
  }
  return url;
}

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
  versionSource: InstalledAppVersion["source"];
}

/** Bounded update-only JSON reader; reject duplicate fields before normalization. */
export function parseUpdateManifestJson(text: string): unknown {
  let cursor = 0, nodes = 0;
  const fail = (): never => { throw new Error("UPDATE_MANIFEST_JSON_INVALID"); };
  const whitespace = () => { while (/[ \t\r\n]/.test(text[cursor] ?? "~")) cursor++; };
  const string = (): string => {
    if (text[cursor++] !== '"') return fail();
    const start = cursor - 1;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === "\\") { cursor++; continue; }
      if (char === '"') {
        let value: unknown;
        try { value = JSON.parse(text.slice(start, cursor)); } catch { return fail(); }
        if (typeof value !== "string" || value.length > 16_384) return fail();
        return value;
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > 8 || ++nodes > 512) return fail();
    whitespace();
    if (text[cursor] === '"') return string();
    if (text[cursor] === "{") {
      cursor++; whitespace();
      const object: Record<string, unknown> = Object.create(null);
      if (text[cursor] === "}") { cursor++; return object; }
      while (true) {
        whitespace(); const key = string();
        if (key.length > 128 || Object.prototype.hasOwnProperty.call(object, key)) return fail();
        whitespace(); if (text[cursor++] !== ":") return fail();
        object[key] = value(depth + 1); whitespace();
        const end = text[cursor++]; if (end === "}") return object;
        if (end !== ",") return fail();
      }
    }
    if (text[cursor] === "[") {
      cursor++; whitespace(); const array: unknown[] = [];
      if (text[cursor] === "]") { cursor++; return array; }
      while (true) {
        array.push(value(depth + 1)); whitespace(); const end = text[cursor++];
        if (end === "]") return array;
        if (end !== ",") return fail();
      }
    }
    for (const [token, literal] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(token, cursor)) { cursor += token.length; return literal; }
    }
    const number = /^(?:0|[1-9][0-9]{0,18})(?=[ \t\r\n,}\]]|$)/.exec(text.slice(cursor));
    if (!number || !Number.isSafeInteger(Number(number[0]))) return fail();
    cursor += number[0].length; return Number(number[0]);
  };
  if (!text || text.length > 32_768) return fail();
  const result = value(0); whitespace();
  if (cursor !== text.length) return fail();
  return result;
}

/** Reject malformed release metadata before an update or download is offered. */
export function validateUpdateManifest(value: unknown, backendBaseUrl: string): UpdateManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("UPDATE_MANIFEST_INVALID");
  const data = value as Record<string, unknown>;
  const version = data.version_name ?? data.latest_version;
  const filename = data.apk_filename;
  const sha = data.apk_sha256;
  if (!Number.isSafeInteger(data.version_code) || Number(data.version_code) < 1 || Number(data.version_code) > 2_147_483_647
    || typeof version !== "string" || !version || version.length > 128
    || (data.latest_version !== undefined && data.latest_version !== version)
    || typeof sha !== "string" || !/^[a-f0-9]{64}$/.test(sha)
    || !Number.isSafeInteger(data.apk_size_bytes) || Number(data.apk_size_bytes) < 1 || Number(data.apk_size_bytes) > MAX_APK_BYTES
    || typeof filename !== "string") throw new Error("UPDATE_MANIFEST_INVALID");
  const match = /^kael-([1-9][0-9]{0,9})-([a-f0-9]{8,64})\.apk$/.exec(filename);
  if (!match || Number(match[1]) !== data.version_code || !sha.startsWith(match[2])) throw new Error("UPDATE_MANIFEST_BINDING_INVALID");
  const rawUrl = data.download_url ?? data.apk_url;
  if (typeof rawUrl !== "string") throw new Error("UPDATE_MANIFEST_INVALID");
  const url = validateUpdateUrl(rawUrl, backendBaseUrl, "apk");
  if (url.pathname !== `/app/download/${filename}`) throw new Error("UPDATE_MANIFEST_BINDING_INVALID");
  const notes = data.release_notes ?? "";
  const changelog = data.changelog ?? (notes ? [notes] : []);
  if (typeof notes !== "string" || notes.length > 16_384 || !Array.isArray(changelog) || changelog.length > 100
    || changelog.some((line) => typeof line !== "string" || line.length > 4096)
    || (data.force_update !== undefined && typeof data.force_update !== "boolean")) throw new Error("UPDATE_MANIFEST_INVALID");
  const date = data.published_at ?? data.release_date ?? "";
  if (typeof date !== "string" || date.length > 64) throw new Error("UPDATE_MANIFEST_INVALID");
  return { app_name: APP_NAME, latest_version: version, version_name: version, version_code: data.version_code as number,
    apk_url: url.toString(), download_url: url.toString(), apk_filename: filename, apk_sha256: sha,
    apk_size_bytes: data.apk_size_bytes as number, release_notes: notes, changelog: changelog as string[],
    force_update: data.force_update === true, published_at: date, release_date: date };
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
  const validated = validateUpdateUrl(url.trim(), getApiConfig().baseUrl, "manifest");
  localStorage.setItem(UPDATE_MANIFEST_URL_KEY, validated.toString());
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
  const validatedUrl = validateUpdateUrl(url, config.baseUrl, "manifest");
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
    res = await fetch(validatedUrl.toString(), {
      method: "GET",
      headers,
      redirect: "error",
      signal: hasNativeTimeout ? AbortSignal.timeout(timeoutMs) : controller!.signal,
    });
    if (!res.ok) throw new Error(`UPDATE_MANIFEST_HTTP_${res.status}`);
    if (!res.body) throw new Error("UPDATE_MANIFEST_EMPTY");
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 32_768) {
          await reader.cancel();
          throw new Error("UPDATE_MANIFEST_TOO_LARGE");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return validateUpdateManifest(parseUpdateManifestJson(text), config.baseUrl);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Compare version codes to determine if update is available */
export function isUpdateAvailable(manifest: UpdateManifest, currentVersionCode: number): boolean {
  return Number.isSafeInteger(currentVersionCode) && currentVersionCode > 0 && manifest.version_code > currentVersionCode;
}

/** Full update check flow */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const installed = await readInstalledAppVersion();
    const manifest = await fetchUpdateManifest();
    return {
      updateAvailable: isUpdateAvailable(manifest, installed.versionCode),
      currentVersion: installed.version,
      currentVersionCode: installed.versionCode,
      versionSource: installed.source,
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
 * without claiming a download or installation receipt.
 * On web/desktop, falls back to blob + <a> download trick.
 */
export interface ApkDownloadHandoff { kind: "browser_opened" | "browser_download_requested" }

export async function downloadApk(
  apkUrl: string,
  onProgress?: (percent: number) => void,
  expectedManifest?: UpdateManifest,
): Promise<ApkDownloadHandoff> {
  const config = getApiConfig();
  const requested = validateUpdateUrl(apkUrl, config.baseUrl, "apk");
  const manifest = expectedManifest ? validateUpdateManifest(expectedManifest, config.baseUrl) : null;
  if (manifest && requested.toString() !== manifest.download_url) throw new Error("UPDATE_MANIFEST_BINDING_INVALID");
  const transportUrl = await requestScopedResourceUrl(requested.pathname);
  const handoffUrl = new URL(transportUrl);
  if (handoffUrl.origin !== requested.origin || handoffUrl.pathname !== requested.pathname) throw new Error("UPDATE_ROUTE_CHANGED");

  // On native Android, delegate to system browser for proper APK install flow
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    await Browser.open({ url: transportUrl });
    return { kind: "browser_opened" };
  }

  // Web fallback: fetch + blob download
  const res = await fetch(transportUrl, { redirect: "error" });
  if (!res.ok) throw new Error(`Download fallito: ${res.status}`);

  const contentLength = res.headers.get("Content-Length");
  const total = manifest?.apk_size_bytes ?? (contentLength ? Number(contentLength) : 0);
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_APK_BYTES) throw new Error("UPDATE_DOWNLOAD_SIZE_INVALID");
  if (!res.body) throw new Error("UPDATE_DOWNLOAD_EMPTY");

  const reader = res.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;

  try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > (manifest?.apk_size_bytes ?? MAX_APK_BYTES)) {
      await reader.cancel();
      throw new Error("UPDATE_DOWNLOAD_SIZE_INVALID");
    }
    chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer);
    if (total > 0) {
      onProgress?.(Math.round((received / total) * 100));
    }
  }
  } finally { reader.releaseLock(); }

  const blob = new Blob(chunks, { type: "application/vnd.android.package-archive" });
  if (!received || (manifest && received !== manifest.apk_size_bytes)) throw new Error("UPDATE_DOWNLOAD_SIZE_INVALID");
  if (manifest) {
    if (!crypto.subtle) throw new Error("UPDATE_HASH_UNAVAILABLE");
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const actual = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
    if (actual !== manifest.apk_sha256) throw new Error("UPDATE_DOWNLOAD_HASH_MISMATCH");
  }
  triggerBrowserDownload(blob, manifest?.apk_filename ?? "kael-companion.apk");
  onProgress?.(100);
  return { kind: "browser_download_requested" };
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

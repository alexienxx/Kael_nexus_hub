import { Capacitor, registerPlugin } from "@capacitor/core";
import { getApiConfig } from "@/lib/api/client";

const UPDATE_ENABLED_KEY = "arrakis-native-updates-enabled";
const STATES = new Set([
  "disabled", "configured", "scheduled", "checking", "up_to_date", "downloading", "verifying",
  "install_requested", "installed", "permission_required", "user_action_required", "unavailable", "failed",
] as const);
export type NativeUpdateState = typeof STATES extends Set<infer T> ? T : never;
export interface NativeUpdateStatus {
  enabled: boolean;
  configured: boolean;
  installedVersionName: string;
  installedVersionCode: number;
  canRequestPackageInstalls: boolean;
  platformSupportsUnattended: boolean;
  state: NativeUpdateState;
  errorCode?: string;
  requestedVersionCode?: number;
  lastCheckedAt?: string;
}
interface NativeAppUpdaterPlugin {
  configure(options: { backendUrls: string[]; apiKey: string; enabled: boolean }): Promise<NativeUpdateStatus>;
  checkNow(): Promise<NativeUpdateStatus>;
  getStatus(): Promise<NativeUpdateStatus>;
  openInstallPermissionSettings(): Promise<void>;
}
const updater = registerPlugin<NativeAppUpdaterPlugin>("NativeAppUpdater");

export function isNativeUpdatePlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/** The existing configured route supplies only its port, never a new host. */
export function nativeUpdateOrigins(baseUrl: string): string[] {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("UPDATE_BACKEND_NOT_TRUSTED"); }
  const port = Number(url.port);
  if (url.protocol !== "http:" || !["127.0.0.1", "192.168.178.78", "100.89.31.50"].includes(url.hostname)
    || !Number.isInteger(port) || port < 8000 || port > 8015 || url.username || url.password
    || url.pathname !== "/" || url.search || url.hash) throw new Error("UPDATE_BACKEND_NOT_TRUSTED");
  return [`http://100.89.31.50:${port}`, `http://192.168.178.78:${port}`];
}

export function validateNativeUpdateStatus(value: unknown): NativeUpdateStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("UPDATE_STATUS_INVALID");
  const s = value as Record<string, unknown>;
  if (["enabled", "configured", "canRequestPackageInstalls", "platformSupportsUnattended"].some((k) => typeof s[k] !== "boolean")
    || typeof s.installedVersionName !== "string" || !s.installedVersionName || s.installedVersionName.length > 128
    || !Number.isSafeInteger(s.installedVersionCode) || Number(s.installedVersionCode) < 1
    || !STATES.has(s.state as NativeUpdateState)
    || (s.errorCode !== undefined && (typeof s.errorCode !== "string" || !/^[A-Z][A-Z0-9_-]{0,127}$/.test(s.errorCode)))
    || (s.requestedVersionCode !== undefined && (!Number.isSafeInteger(s.requestedVersionCode) || Number(s.requestedVersionCode) < 1))
    || (s.lastCheckedAt !== undefined && (typeof s.lastCheckedAt !== "string" || s.lastCheckedAt.length > 64 || !Number.isFinite(Date.parse(s.lastCheckedAt))))) {
    throw new Error("UPDATE_STATUS_INVALID");
  }
  return {
    enabled: s.enabled as boolean, configured: s.configured as boolean,
    installedVersionName: s.installedVersionName as string, installedVersionCode: s.installedVersionCode as number,
    canRequestPackageInstalls: s.canRequestPackageInstalls as boolean,
    platformSupportsUnattended: s.platformSupportsUnattended as boolean, state: s.state as NativeUpdateState,
    ...(s.errorCode !== undefined ? { errorCode: s.errorCode as string } : {}),
    ...(s.requestedVersionCode !== undefined ? { requestedVersionCode: s.requestedVersionCode as number } : {}),
    ...(s.lastCheckedAt !== undefined ? { lastCheckedAt: s.lastCheckedAt as string } : {}),
  };
}

export function nativeUpdatesEnabled(): boolean {
  try { return localStorage.getItem(UPDATE_ENABLED_KEY) !== "false"; } catch { return true; }
}

/** Preference contains no credential. A failed native disable remains visibly unavailable. */
let configurationQueue: Promise<NativeUpdateStatus | undefined> = Promise.resolve(undefined);
export function configureNativeUpdates(enabled = nativeUpdatesEnabled()): Promise<NativeUpdateStatus> {
  const operation = configurationQueue.catch(() => undefined).then(async () => {
    if (!isNativeUpdatePlatform()) throw new Error("UPDATE_NATIVE_UNAVAILABLE");
    const disable = () => updater.configure({ backendUrls: [], apiKey: "", enabled: false });
    if (!enabled) return validateNativeUpdateStatus(await disable());
    const config = getApiConfig();
    let backendUrls: string[];
    try {
      backendUrls = nativeUpdateOrigins(config.baseUrl);
      if (!config.apiKey) throw new Error("UPDATE_AUTH_REQUIRED");
    } catch (failure) {
      // Never retain an old native credential/job after the current config is revoked.
      try { validateNativeUpdateStatus(await disable()); }
      catch { throw new Error(`${nativeUpdateErrorCode(failure)}_REVOCATION_UNCONFIRMED`); }
      throw failure;
    }
    try { return validateNativeUpdateStatus(await updater.configure({ backendUrls, apiKey: config.apiKey, enabled: true })); }
    catch (failure) {
      try { validateNativeUpdateStatus(await disable()); }
      catch { throw new Error("UPDATE_CONFIGURATION_REVOCATION_UNCONFIRMED"); }
      throw failure;
    }
  });
  configurationQueue = operation;
  return operation;
}

export async function setNativeUpdatesEnabled(enabled: boolean): Promise<NativeUpdateStatus> {
  localStorage.setItem(UPDATE_ENABLED_KEY, String(enabled));
  return configureNativeUpdates(enabled);
}

export async function getNativeUpdateStatus(): Promise<NativeUpdateStatus> {
  if (!isNativeUpdatePlatform()) throw new Error("UPDATE_NATIVE_UNAVAILABLE");
  return validateNativeUpdateStatus(await updater.getStatus());
}

/** Schedules native work. Its returned state is not a completed installation. */
export async function checkNativeUpdatesNow(): Promise<NativeUpdateStatus> {
  if (!isNativeUpdatePlatform()) throw new Error("UPDATE_NATIVE_UNAVAILABLE");
  return validateNativeUpdateStatus(await updater.checkNow());
}

export async function openNativeInstallSettings(): Promise<void> {
  if (!isNativeUpdatePlatform()) throw new Error("UPDATE_NATIVE_UNAVAILABLE");
  await updater.openInstallPermissionSettings();
}

export function nativeUpdateErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    for (const value of [e.code, e.message]) {
      if (typeof value === "string" && /^[A-Z][A-Z0-9_-]{0,127}$/.test(value)) return value;
    }
  }
  return "UPDATE_NATIVE_UNAVAILABLE";
}

export function nativeUpdateStateLabel(state: NativeUpdateState): string {
  const labels: Record<NativeUpdateState, string> = {
    disabled: "Aggiornamenti automatici disattivati", configured: "Aggiornamenti configurati",
    scheduled: "Controllo programmato da Android", checking: "Controllo in corso",
    up_to_date: "Ultimo controllo: nessuna nuova versione", downloading: "Download in corso",
    verifying: "Verifica del pacchetto in corso", install_requested: "Installazione richiesta ad Android",
    installed: "Installazione confermata da Android", permission_required: "Permesso iniziale richiesto",
    user_action_required: "Android richiede una conferma", unavailable: "Aggiornamenti non disponibili",
    failed: "Aggiornamento non completato",
  };
  return labels[state];
}

/** A changed terminal snapshot is a new owner observation, never a job-correlated receipt. */
export function hasNewNativeUpdateOutcome(before: NativeUpdateStatus, current: NativeUpdateStatus): boolean {
  if (["configured", "scheduled", "checking", "downloading", "verifying", "install_requested"].includes(current.state)) return false;
  return before.state !== current.state || before.lastCheckedAt !== current.lastCheckedAt
    || before.errorCode !== current.errorCode || before.requestedVersionCode !== current.requestedVersionCode
    || before.installedVersionCode !== current.installedVersionCode;
}

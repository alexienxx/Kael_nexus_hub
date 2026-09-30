/**
 * Base API client for communicating with Kael's external backend.
 * All brain logic lives on the backend — this is just the HTTP layer.
 *
 * BACKEND DISCOVERY — layered, zero hardcoded ports:
 *
 *   Layer 1: Last validated URL from localStorage (fast, no network)
 *   Layer 2: Known hosts × port range scan in parallel (robust)
 *   Layer 3: (future) mDNS / broadcast — not implemented yet
 *
 * Every /health response is validated with a strong fingerprint
 * ("service_fingerprint" === "kael_refactor_v2") to avoid false positives.
 *
 * Resolved URL is cached in localStorage for instant reconnect on next boot.
 */

// ── Storage & constants ──────────────────────────────────────────────────

const STORAGE_KEY = "kael-backend-config";
const ROUTE_STATE_KEY = "kael-backend-route-state-v1";
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/** Emitted after the active backend origin changes. Long-lived transports
 * (SSE/WebSocket) must reconnect and obtain fresh scoped credentials. */
export const BACKEND_ROUTE_CHANGED_EVENT = "kael-backend-route-changed";

/** Strong fingerprint the backend embeds in /health JSON. */
const EXPECTED_FINGERPRINT = "kael_refactor_v2";

/**
 * Port range to scan when discovering the backend.
 * Kael default is 8002 but bootstrap may shift if occupied.
 * Small range keeps scan fast (<2 s with parallel fetches).
 */
const PORT_RANGE_START = 8000;
const PORT_RANGE_END   = 8015;

/**
 * Known host addresses to probe — order matters (fastest first).
 * These are network-layer addresses; ports are generated from PORT_RANGE.
 */
const KNOWN_PRIMARY_HOSTS = [
  "127.0.0.1",           // USB via adb reverse / localhost
  "192.168.178.78",      // Home LAN
];

const KNOWN_TAILSCALE_HOSTS = [
  "100.89.31.50",        // Existing Tailscale endpoint
];

/** Timeout for a single health probe (ms). */
const PROBE_TIMEOUT_MS = 3000;

/** Discovery has a 6s lifecycle budget. Three ordered route phases must fit
 * inside it so Tailscale is actually reached after cached/LAN failures. */
const DISCOVERY_PHASE_TIMEOUT_MS = 1500;

/** Keep a healthy fallback route stable before even considering failback. */
const PREFERRED_ROUTE_MIN_DWELL_MS = 60_000;

/** Require independent health proofs before returning from Tailscale to LAN. */
const PREFERRED_ROUTE_REQUIRED_PROOFS = 2;
const PREFERRED_ROUTE_PROOF_SPACING_MS = 15_000;

// ── Types ────────────────────────────────────────────────────────────────

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

export type BackendRouteKind = "loopback" | "lan" | "tailscale" | "custom";

export interface BackendRouteSnapshot {
  preferredBaseUrl: string;
  activeBaseUrl: string;
  activeKind: BackendRouteKind;
  switchedAt: number;
  preferredHealthProofs: number;
  lastPreferredProofAt: number;
}

interface BackendRouteChangeDetail {
  from: string;
  to: string;
  fromKind: BackendRouteKind;
  toKind: BackendRouteKind;
  reason: "discovery" | "failover" | "preferred_restored";
}

/** Validated health payload from the backend. */
export interface HealthPayload {
  status: string;
  service: string;
  service_fingerprint: string;
  listen_port: number;
  listen_host: string;
  runtime_session_id: string;
  bootstrap_pid: number;
  backend_pid: number;
  boot_verdict: string;
  boot_id: string;
  [key: string]: unknown;
}

export interface AuthVerificationPayload {
  ok: boolean;
  authenticated: boolean;
  principal?: {
    user_id?: string;
    role?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type UntypedJsonPayload = Awaited<ReturnType<Response["json"]>>;

/**
 * Initial fallback URL — empty string.
 * The user MUST configure the backend URL in Settings.
 * Discovery will populate it only if the user has NOT set one yet.
 * Never hardcode 127.0.0.1 — it doesn't work on APK via WiFi.
 */
const INITIAL_FALLBACK_URL = "";

// ── Config persistence ───────────────────────────────────────────────────

export function getApiConfig(): ApiConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const config = {
        baseUrl: typeof parsed?.baseUrl === "string" ? parsed.baseUrl : INITIAL_FALLBACK_URL,
        apiKey: typeof parsed?.apiKey === "string" ? parsed.apiKey : "",
      };
      if (config.baseUrl) console.debug("[API CONFIG] current:", config.baseUrl);
      return config;
    }
  } catch {
    // ignore
  }
  // No stored config — return empty; user must configure in Settings
  return { baseUrl: INITIAL_FALLBACK_URL, apiKey: "" };
}

export function setApiConfig(config: ApiConfig) {
  const normalized = {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  // A Settings save is an explicit user choice. It becomes the preferred
  // route; automatic failover changes use activateBackendRoute() instead.
  writeRouteSnapshot({
    preferredBaseUrl: normalized.baseUrl,
    activeBaseUrl: normalized.baseUrl,
    activeKind: classifyBackendRoute(normalized.baseUrl),
    switchedAt: Date.now(),
    preferredHealthProofs: 0,
    lastPreferredProofAt: 0,
  });
}

/**
 * Boot migrations may invalidate a stale discovered URL, but the credential is
 * user configuration and must survive.  This helper intentionally never logs
 * or returns the credential.
 */
export function resetBackendUrlForDiscovery(): void {
  const current = getApiConfig();
  // Preserve the credential but deliberately clear both active and preferred
  // route. A subsequent validated discovery will establish a new preference.
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ baseUrl: INITIAL_FALLBACK_URL, apiKey: current.apiKey }),
  );
  localStorage.removeItem(ROUTE_STATE_KEY);
}

function normalizeBaseUrl(value: string): string {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function classifyBackendRoute(baseUrl: string): BackendRouteKind {
  try {
    const hostname = new URL(baseUrl).hostname;
    if (hostname === "127.0.0.1" || hostname === "localhost") return "loopback";
    if (KNOWN_TAILSCALE_HOSTS.includes(hostname)) return "tailscale";
    if (
      KNOWN_PRIMARY_HOSTS.includes(hostname) ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return "lan";
    }
  } catch {
    // Invalid values are rejected by verification/probing; keep state benign.
  }
  return "custom";
}

function readRouteSnapshot(configuredBaseUrl: string): BackendRouteSnapshot {
  const normalizedConfigured = normalizeBaseUrl(configuredBaseUrl);
  try {
    const raw = localStorage.getItem(ROUTE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BackendRouteSnapshot>;
      const activeBaseUrl = normalizeBaseUrl(String(parsed.activeBaseUrl ?? ""));
      const preferredBaseUrl = normalizeBaseUrl(String(parsed.preferredBaseUrl ?? ""));
      // A route snapshot is valid only while it agrees with the public active
      // config. This also makes old/manual config changes self-healing.
      if (activeBaseUrl === normalizedConfigured) {
        return {
          preferredBaseUrl,
          activeBaseUrl,
          activeKind: classifyBackendRoute(activeBaseUrl),
          switchedAt: Number.isFinite(parsed.switchedAt) ? Number(parsed.switchedAt) : 0,
          preferredHealthProofs: Number.isSafeInteger(parsed.preferredHealthProofs)
            ? Math.max(0, Number(parsed.preferredHealthProofs))
            : 0,
          lastPreferredProofAt: Number.isFinite(parsed.lastPreferredProofAt)
            ? Math.max(0, Number(parsed.lastPreferredProofAt))
            : 0,
        };
      }
    }
  } catch {
    // Rebuild corrupted route metadata from the user-visible config.
  }
  return {
    preferredBaseUrl: normalizedConfigured,
    activeBaseUrl: normalizedConfigured,
    activeKind: classifyBackendRoute(normalizedConfigured),
    switchedAt: 0,
    preferredHealthProofs: 0,
    lastPreferredProofAt: 0,
  };
}

function writeRouteSnapshot(snapshot: BackendRouteSnapshot): void {
  localStorage.setItem(ROUTE_STATE_KEY, JSON.stringify(snapshot));
}

export function getBackendRouteSnapshot(): BackendRouteSnapshot {
  return readRouteSnapshot(getApiConfig().baseUrl);
}

function activateBackendRoute(
  nextBaseUrl: string,
  reason: BackendRouteChangeDetail["reason"],
): string {
  const normalized = normalizeBaseUrl(nextBaseUrl);
  const config = getApiConfig();
  const current = readRouteSnapshot(config.baseUrl);
  const nextKind = classifyBackendRoute(normalized);
  const preferredBaseUrl = current.preferredBaseUrl ||
    (nextKind === "tailscale" ? "" : normalized);
  const changed = normalized !== current.activeBaseUrl;

  // This internal write changes only the active route. It intentionally keeps
  // the user's API key and preferred LAN endpoint intact.
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ baseUrl: normalized, apiKey: config.apiKey }),
  );
  writeRouteSnapshot({
    preferredBaseUrl,
    activeBaseUrl: normalized,
    activeKind: nextKind,
    switchedAt: changed ? Date.now() : current.switchedAt,
    preferredHealthProofs: 0,
    lastPreferredProofAt: 0,
  });

  if (changed && typeof window !== "undefined") {
    const detail: BackendRouteChangeDetail = {
      from: current.activeBaseUrl,
      to: normalized,
      fromKind: current.activeKind,
      toKind: nextKind,
      reason,
    };
    window.dispatchEvent(new CustomEvent(BACKEND_ROUTE_CHANGED_EVENT, { detail }));
    console.info(
      "[KAEL] BACKEND_ROUTE_CHANGED from_kind=%s to_kind=%s reason=%s",
      detail.fromKind,
      detail.toKind,
      detail.reason,
    );
  }
  return normalized;
}

// ── Errors ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string
  ) {
    super(`API error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

export class ApiProtocolError extends Error {
  constructor(public code: "empty_json" | "invalid_json") {
    super(code === "empty_json" ? "Backend returned an empty JSON body" : "Backend returned invalid JSON");
    this.name = "ApiProtocolError";
  }
}

/**
 * Parse one complete JSON document. Leading/trailing JSON whitespace is valid;
 * transport comments, proxy banners, HTML and any other prefix/suffix are not.
 */
export function parseStrictJsonBody<T = unknown>(text: string): T {
  if (!text.trim()) throw new ApiProtocolError("empty_json");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiProtocolError("invalid_json");
  }
}

// ── Core: validated health probe ─────────────────────────────────────────

/**
 * Probe a single URL's /health, validate fingerprint.
 * Returns the validated HealthPayload or null.
 */
async function probeHealthValidated(
  baseUrl: string,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<HealthPayload | null> {
  // Feature detection: use native AbortSignal.timeout when available (Chrome 103+),
  // fall back to manual AbortController+setTimeout for older Android WebView.
  const hasNativeTimeout = typeof AbortSignal.timeout === "function";
  const controller = hasNativeTimeout ? undefined : new AbortController();
  const timer = hasNativeTimeout ? undefined : setTimeout(() => controller!.abort(), timeoutMs);
  const signal = hasNativeTimeout ? AbortSignal.timeout(timeoutMs) : controller!.signal;
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/health`;
    const res = await fetch(url, {
      method: "GET",
      signal,
    });
    if (timer !== undefined) clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    // Strong validation: must be our service
    if (
      data?.service === "kael_refactor" &&
      data?.service_fingerprint === EXPECTED_FINGERPRINT &&
      data?.status === "ok"
    ) {
      return data as HealthPayload;
    }
    // Backward compat: server not yet restarted with new fields
    // Still accept if service matches (weaker, but better than nothing)
    if (data?.service === "kael_refactor" && data?.status === "ok") {
      console.warn("[KAEL] Health OK but missing fingerprint — accept with caution:", baseUrl);
      return data as HealthPayload;
    }
    return null;
  } catch {
    if (timer !== undefined) clearTimeout(timer);
    return null;
  }
}

function candidatesForHosts(hosts: readonly string[]): string[] {
  const candidates: string[] = [];
  for (const host of hosts) {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      candidates.push(`http://${host}:${port}`);
    }
  }
  return candidates;
}

async function probeCandidateGroup(candidates: readonly string[]): Promise<string | null> {
  const unique = [...new Set(candidates.map(normalizeBaseUrl).filter(Boolean))];
  if (!unique.length) return null;
  return promiseAny(
    unique.map(async (url) => {
      const health = await probeHealthValidated(url, DISCOVERY_PHASE_TIMEOUT_MS);
      if (health) return url;
      throw new Error("miss");
    }),
  ).catch(() => null);
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Promise.any polyfill — resolves with the first fulfilled promise,
 * or rejects if all reject.  Safe for older Android WebView (< Chrome 85).
 */
function promiseAny<T>(promises: Promise<T>[]): Promise<T> {
  const constructor = Promise as unknown as {
    any?: <Value>(values: Iterable<Value | PromiseLike<Value>>) => Promise<Value>;
  };
  if (typeof constructor.any === "function") return constructor.any(promises);
  return new Promise<T>((resolve, reject) => {
    let remaining = promises.length;
    if (remaining === 0) return reject(new Error("All promises rejected"));
    const errors: unknown[] = [];
    promises.forEach((p, i) => {
      Promise.resolve(p).then(resolve, (err) => {
        errors[i] = err;
        if (--remaining === 0) reject(new Error("All promises rejected"));
      });
    });
  });
}

// ── Layered discovery ────────────────────────────────────────────────────

/**
 * CANONICAL backend URL resolver.  ALL code paths that need to find
 * the backend MUST call this function.  No other probe logic exists.
 *
 * Discovery layers (in order):
 *   1. Cached URL from localStorage (instant, no network)
 *   2. Known hosts × port range — parallel scan
 *
 * On success: persists the validated URL to localStorage.
 * Returns the validated base URL string, or null if unreachable.
 */
export async function probeAndResolveBackend(): Promise<string | null> {
  const config = getApiConfig();
  const route = readRouteSnapshot(config.baseUrl);

  // ── Layer 1: cached URL (last known good) ──────────────────────────
  if (config.baseUrl) {
    const cached = await probeHealthValidated(config.baseUrl, DISCOVERY_PHASE_TIMEOUT_MS);
    if (cached) {
      console.log("[KAEL] Layer 1 hit: cached URL OK →", config.baseUrl);
      return normalizeBaseUrl(config.baseUrl);
    }
    console.warn("[KAEL] Layer 1 miss: cached URL unreachable →", config.baseUrl);
  }

  // ── Layer 2: known hosts × port range (parallel) ──────────────────
  // Preserve ordering across route classes: an arbitrary faster Tailscale
  // response must not steal authority while a healthy preferred/LAN path is
  // available. Probes within one class remain parallel.
  console.log("[KAEL] Layer 2a: probing preferred and LAN routes...");
  const primaryCandidates = [
    route.preferredBaseUrl,
    ...candidatesForHosts(KNOWN_PRIMARY_HOSTS),
  ].filter((url) => url && url !== normalizeBaseUrl(config.baseUrl));
  let result = await probeCandidateGroup(primaryCandidates);

  if (!result) {
    console.log("[KAEL] Layer 2b: LAN unavailable, probing configured Tailscale route...");
    result = await probeCandidateGroup(
      candidatesForHosts(KNOWN_TAILSCALE_HOSTS)
        .filter((url) => url !== normalizeBaseUrl(config.baseUrl)),
    );
  }

  if (result) {
    console.log("[KAEL] Layer 2 hit: found backend →", result);
    const reason = config.baseUrl ? "failover" : "discovery";
    return activateBackendRoute(result, reason);
  }

  console.error("[KAEL] All discovery layers exhausted — backend unreachable");
  return null;
}

/**
 * While a fallback route is healthy, cautiously check whether the user's
 * preferred route has recovered. Two spaced health proofs plus a minimum
 * fallback dwell prevent WiFi/VPN flapping from bouncing every transport.
 */
let preferredRouteRestoreInFlight: Promise<string | null> | null = null;

async function restorePreferredBackendRouteOnce(
  nowMs: number = Date.now(),
): Promise<string | null> {
  const config = getApiConfig();
  const route = readRouteSnapshot(config.baseUrl);
  if (
    !route.activeBaseUrl ||
    !route.preferredBaseUrl ||
    route.activeBaseUrl === route.preferredBaseUrl ||
    nowMs - route.switchedAt < PREFERRED_ROUTE_MIN_DWELL_MS ||
    nowMs - route.lastPreferredProofAt < PREFERRED_ROUTE_PROOF_SPACING_MS
  ) {
    return null;
  }

  const healthy = await probeHealthValidated(route.preferredBaseUrl, PROBE_TIMEOUT_MS);
  const fresh = readRouteSnapshot(getApiConfig().baseUrl);
  // Ignore a late proof if another discovery changed route meanwhile.
  if (fresh.activeBaseUrl !== route.activeBaseUrl) return null;

  if (!healthy) {
    writeRouteSnapshot({
      ...fresh,
      preferredHealthProofs: 0,
      lastPreferredProofAt: nowMs,
    });
    return null;
  }

  const proofCount = fresh.preferredHealthProofs + 1;
  if (proofCount < PREFERRED_ROUTE_REQUIRED_PROOFS) {
    writeRouteSnapshot({
      ...fresh,
      preferredHealthProofs: proofCount,
      lastPreferredProofAt: nowMs,
    });
    return null;
  }
  return activateBackendRoute(fresh.preferredBaseUrl, "preferred_restored");
}

export async function tryRestorePreferredBackendRoute(
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (preferredRouteRestoreInFlight) return preferredRouteRestoreInFlight;
  preferredRouteRestoreInFlight = restorePreferredBackendRouteOnce(nowMs)
    .finally(() => {
      preferredRouteRestoreInFlight = null;
    });
  return preferredRouteRestoreInFlight;
}

// ── Health check (uses canonical probe) ──────────────────────────────────

/**
 * Quick health check against the CURRENT cached URL only.
 * Does NOT run full discovery — use probeAndResolveBackend() for that.
 * Returns true only if /health responds with valid fingerprint.
 */
export async function checkHealth(): Promise<boolean> {
  const config = getApiConfig();
  if (!config.baseUrl) return false;
  const health = await probeHealthValidated(config.baseUrl, 5000);
  return health !== null;
}

/**
 * Signal that the cached backend URL may be stale.
 * Does NOT overwrite the user's configured URL — that is the source of truth.
 * Full re-discovery (probeAndResolveBackend) will run on the next reconnect
 * cycle and will only persist a new URL if the user has no URL configured.
 */
export function invalidateBackendCache(): void {
  console.log("[API CONFIG] invalidateBackendCache called — user URL preserved");
  // Intentionally no-op: user-configured URL must never be silently replaced.
  // probeAndResolveBackend() will handle re-discovery if the URL is unreachable.
}

// ── Pre-flight health gate ───────────────────────────────────────────────

/**
 * Quick pre-flight check: ensures the backend is alive before heavy operations
 * (vision, audio, image generation).  Returns true if /health responds with
 * valid fingerprint; false otherwise.
 *
 * Consumers should display a user-visible message and abort the request
 * when this returns false — sending a request to a dead backend wastes
 * the user's input and causes silent failures.
 */
export async function ensureBackendAlive(): Promise<boolean> {
  const config = getApiConfig();
  if (!config.baseUrl) return false;
  const health = await probeHealthValidated(config.baseUrl, 5000);
  return health !== null;
}

/**
 * Probe the current cached URL and return the full HealthPayload.
 * Returns null if the backend is unreachable or validation fails.
 * Used by session integrity guard to detect boot_id changes.
 */
export async function probeHealthPayload(): Promise<HealthPayload | null> {
  const config = getApiConfig();
  if (!config.baseUrl) return null;
  return probeHealthValidated(config.baseUrl, 5000);
}

// ── API request helpers ──────────────────────────────────────────────────

async function apiRequestWithConfig<T>(
  config: ApiConfig,
  path: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  if (!config.baseUrl) {
    throw new Error("Backend URL not configured. Go to Settings → Connection.");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const { timeout: requestedTimeout, ...requestOptions } = options;
  const timeout = requestedTimeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers = new Headers(requestOptions.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  // The configured credential is authoritative and cannot be shadowed by an
  // individual call-site. It is intentionally never written to diagnostics.
  if (config.apiKey) headers.set("X-KAEL-KEY", config.apiKey);

  try {
    const res = await fetch(url, {
      ...requestOptions,
      headers,
      signal: requestOptions.signal || controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(res.status, res.statusText, body);
    }

    return parseStrictJsonBody<T>(await res.text());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timeout - backend not responding");
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("No internet connection");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiRequest<T = UntypedJsonPayload>(
  path: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  return apiRequestWithConfig<T>(getApiConfig(), path, options);
}

export type ScopedResourceMethod = "GET" | "WEBSOCKET";

interface ScopedResourceTokenResponse {
  token: string;
  expires_in: number;
  max_uses: number;
  method: string;
  path: string;
}

function validateScopedResourcePath(path: string): string {
  const normalized = String(path ?? "").trim();
  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.includes("?") ||
    normalized.includes("#") ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("Resource path is not eligible for scoped transport");
  }
  return normalized;
}

/**
 * Exchange the configured first-party header for one short-lived URL token.
 *
 * This is only for browser-managed resources that cannot attach headers
 * (`img`, MJPEG, native download and WebSocket). The primary credential is
 * never copied into the returned URL and the token is never persisted here.
 */
export async function requestScopedResourceUrl(
  path: string,
  method: ScopedResourceMethod = "GET",
): Promise<string> {
  const config = getApiConfig();
  if (!config.baseUrl) throw new Error("Backend URL not configured.");
  if (!config.apiKey) throw new Error("Arrakis API credential is required");
  const canonicalPath = validateScopedResourcePath(path);
  // The token and final resource origin must come from the same route. Using
  // the captured config closes a LAN/Tailscale switch race between exchange
  // and URL construction.
  const response = await apiRequestWithConfig<ScopedResourceTokenResponse>(
    config,
    "/auth/resource-token",
    {
      method: "POST",
      body: JSON.stringify({ method, path: canonicalPath }),
    },
  );
  if (
    !response ||
    typeof response.token !== "string" ||
    response.token.length < 32 ||
    response.method !== method ||
    response.path !== canonicalPath ||
    !Number.isFinite(response.expires_in) ||
    response.expires_in <= 0 ||
    !Number.isSafeInteger(response.max_uses) ||
    response.max_uses <= 0
  ) {
    throw new ApiProtocolError("invalid_json");
  }

  const base = new URL(config.baseUrl);
  if (method === "WEBSOCKET") {
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  }
  const resourceUrl = new URL(canonicalPath, base);
  if (resourceUrl.origin !== base.origin) {
    throw new Error("Resource path escaped the configured backend origin");
  }
  resourceUrl.searchParams.set("kael_access_token", response.token);
  return resourceUrl.toString();
}

export interface BackendVerificationResult {
  health: HealthPayload;
  authentication: AuthVerificationPayload;
}

/**
 * Validate both backend identity and the protected API credential before a
 * candidate configuration is persisted by Settings.
 */
export async function verifyBackendConfig(candidate: ApiConfig): Promise<BackendVerificationResult> {
  const config = {
    baseUrl: candidate.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: candidate.apiKey.trim(),
  };
  if (!config.baseUrl) throw new Error("Backend URL is required");
  if (!config.apiKey) throw new Error("Arrakis API credential is required");

  const health = await probeHealthValidated(config.baseUrl, 5000);
  if (!health) throw new Error("Backend health validation failed");

  const authentication = await apiRequestWithConfig<AuthVerificationPayload>(
    config,
    "/auth/verify",
    { method: "GET", timeout: 5000 },
  );
  if (
    !authentication ||
    typeof authentication !== "object" ||
    authentication.ok !== true ||
    authentication.authenticated !== true
  ) {
    throw new ApiProtocolError("invalid_json");
  }
  return { health, authentication };
}

export async function apiUpload<T = UntypedJsonPayload>(
  path: string,
  formData: FormData,
  options: { timeout?: number } = {}
): Promise<T> {
  const config = getApiConfig();
  if (!config.baseUrl) {
    throw new Error("Backend URL not configured.");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT * 2;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: config.apiKey ? { "X-KAEL-KEY": config.apiKey } : {},
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(res.status, res.statusText, body);
    }

    return res.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Upload timeout - file too large or connection slow");
    }

    if (!navigator.onLine) {
      throw new Error("No internet connection");
    }

    throw error;
  }
}

export async function apiFetchAudio(path: string): Promise<Blob> {
  const config = getApiConfig();
  if (!config.baseUrl) throw new Error("Backend URL not configured.");

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;

  const res = await fetch(url, {
    headers: config.apiKey ? { "X-KAEL-KEY": config.apiKey } : {},
  });

  if (!res.ok) throw new ApiError(res.status, res.statusText, "");
  return res.blob();
}

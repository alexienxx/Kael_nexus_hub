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
const DEFAULT_TIMEOUT = 30000; // 30 seconds

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
const KNOWN_HOSTS = [
  "127.0.0.1",           // USB via adb reverse / localhost
  "192.168.178.78",      // Home LAN
  "100.89.31.50",        // Tailscale VPN
];

/** Timeout for a single health probe (ms). */
const PROBE_TIMEOUT_MS = 3000;

// ── Types ────────────────────────────────────────────────────────────────

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Boot migrations may invalidate a stale discovered URL, but the credential is
 * user configuration and must survive.  This helper intentionally never logs
 * or returns the credential.
 */
export function resetBackendUrlForDiscovery(): void {
  const current = getApiConfig();
  setApiConfig({ baseUrl: INITIAL_FALLBACK_URL, apiKey: current.apiKey });
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

  // ── Layer 1: cached URL (last known good) ──────────────────────────
  if (config.baseUrl) {
    const cached = await probeHealthValidated(config.baseUrl);
    if (cached) {
      console.log("[KAEL] Layer 1 hit: cached URL OK →", config.baseUrl);
      return config.baseUrl;
    }
    console.warn("[KAEL] Layer 1 miss: cached URL unreachable →", config.baseUrl);
  }

  // ── Layer 2: known hosts × port range (parallel) ──────────────────
  console.log("[KAEL] Layer 2: scanning known hosts × port range...");
  const candidates: string[] = [];
  for (const host of KNOWN_HOSTS) {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      candidates.push(`http://${host}:${port}`);
    }
  }

  // Fire ALL probes in parallel — first valid answer wins
  const result = await promiseAny(
    candidates.map(async (url) => {
      const health = await probeHealthValidated(url, PROBE_TIMEOUT_MS);
      if (health) return url;
      throw new Error("miss"); // rejected = not found, keeps promiseAny going
    })
  ).catch(() => null); // all failed

  if (result) {
    console.log("[KAEL] Layer 2 hit: found backend →", result);
    // Layer 2 means the cached URL was dead or empty.
    // The ONLY truth is the backend's active port — always persist it.
    console.log("[API CONFIG] persisting Layer 2 discovery:", result);
    setApiConfig({ ...config, baseUrl: result });
    return result;
  }

  console.error("[KAEL] All discovery layers exhausted — backend unreachable");
  return null;
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
  if (!config.apiKey) throw new Error("Kael API credential is required");

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

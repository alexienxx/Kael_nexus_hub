/**
 * Base API client for communicating with Kael's external backend.
 * All brain logic lives on the backend — this is just the HTTP layer.
 */

const STORAGE_KEY = "kael-backend-config";
const DEFAULT_TIMEOUT = 30000; // 30 seconds

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Default backend URL — matches the home LAN server.
 * User override (from Settings) takes precedence.
 */
const DEFAULT_BASE_URL = "http://192.168.178.78:8002";

/**
 * Known backend URLs to probe in order.
 * USB (adb reverse) first, then LAN, then Tailscale VPN.
 */
const KNOWN_BACKEND_URLS = [
  "http://127.0.0.1:8002",          // USB via adb reverse
  "http://192.168.178.78:8002",     // Home LAN
  "http://100.89.31.50:8002",       // Tailscale VPN
];

export function getApiConfig(): ApiConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // If stored config has a non-empty baseUrl, use it
      if (parsed.baseUrl) return parsed;
    }
  } catch (error) {
    // Ignore parsing errors
  }
  // No stored config or empty baseUrl — use LAN default
  return { baseUrl: DEFAULT_BASE_URL, apiKey: "" };
}

export function setApiConfig(config: ApiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

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

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const config = getApiConfig();
  if (!config.baseUrl) {
    throw new Error("Backend URL not configured. Go to Settings → Connection.");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
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
      throw new Error("Request timeout - backend not responding");
    }

    if (!navigator.onLine) {
      throw new Error("No internet connection");
    }

    throw error;
  }
}

export async function apiUpload<T = any>(
  path: string,
  formData: FormData,
  options: { timeout?: number } = {}
): Promise<T> {
  const config = getApiConfig();
  if (!config.baseUrl) {
    throw new Error("Backend URL not configured.");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT * 2; // 60 seconds for uploads

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
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
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
  });

  if (!res.ok) throw new ApiError(res.status, res.statusText, "");
  return res.blob();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const config = getApiConfig();
    if (!config.baseUrl) return false;
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/health`, {
      method: "GET",
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (error) {
    // Connection error or timeout
    return false;
  }
}

/**
 * Probe known backend URLs and auto-switch to the first reachable one.
 * Tries: stored/default URL first, then LAN, then Tailscale VPN.
 * Updates localStorage config when a working URL is found.
 *
 * Call once on app boot — results are cached in localStorage.
 */
export async function probeAndResolveBackend(): Promise<string | null> {
  const config = getApiConfig();

  // Build ordered list: current config first, then known URLs (deduped)
  const candidates = [config.baseUrl, ...KNOWN_BACKEND_URLS].filter(
    (url, i, arr) => url && arr.indexOf(url) === i
  );

  for (const url of candidates) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        // Found a working backend — persist it
        if (url !== config.baseUrl) {
          console.log(`[KAEL] Backend auto-switched: ${config.baseUrl} -> ${url}`);
          setApiConfig({ ...config, baseUrl: url });
        }
        return url;
      }
    } catch {
      // Not reachable, try next
    }
  }

  console.warn("[KAEL] No reachable backend found among:", candidates);
  return null;
}

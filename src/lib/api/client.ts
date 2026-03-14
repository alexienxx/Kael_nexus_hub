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

export function getApiConfig(): ApiConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (error) {
    // Ignore parsing errors
  }
  return { baseUrl: "", apiKey: "" };
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

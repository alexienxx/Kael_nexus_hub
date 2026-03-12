/**
 * Base API client for communicating with Kael's external backend.
 * All brain logic lives on the backend — this is just the HTTP layer.
 */

const STORAGE_KEY = "kael-backend-config";

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

export function getApiConfig(): ApiConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { baseUrl: "", apiKey: "" };
}

export function setApiConfig(config: ApiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const config = getApiConfig();
  if (!config.baseUrl) {
    throw new Error("Backend URL not configured. Go to Settings → Connection.");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function apiUpload<T = any>(
  path: string,
  formData: FormData
): Promise<T> {
  const config = getApiConfig();
  if (!config.baseUrl) {
    throw new Error("Backend URL not configured.");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Upload error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function apiFetchAudio(path: string): Promise<Blob> {
  const config = getApiConfig();
  if (!config.baseUrl) throw new Error("Backend URL not configured.");

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;

  const res = await fetch(url, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
  });

  if (!res.ok) throw new Error(`Audio fetch error ${res.status}`);
  return res.blob();
}

/** Check if backend is reachable */
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
  } catch {
    return false;
  }
}

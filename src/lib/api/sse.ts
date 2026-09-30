/**
 * SSE API helpers — obtain single-use token and build EventSource URL.
 *
 * Used by useKaelSSE hook. No polling. No pending. SSE puro.
 *
 * Flow:
 *   1. obtainSSEToken() → POST /chat/events/token (with X-KAEL-KEY auth)
 *   2. buildSSEUrl(token) → constructs EventSource URL with ?token= param
 *   3. useKaelSSE opens EventSource(url) and listens for events
 *
 * The token is single-use and short-lived (60s). On reconnect,
 * useKaelSSE obtains a fresh token automatically.
 */

import { getApiConfig } from "./client";

/**
 * Obtain a short-lived single-use SSE token from the backend.
 *
 * Required because native EventSource cannot send custom HTTP headers.
 * The token replaces the X-KAEL-KEY for the SSE connection only.
 *
 * @throws Error if backend URL not configured or auth fails
 */
export async function obtainSSEToken(): Promise<string> {
  const connection = await obtainSSEConnection();
  return connection.token;
}

export interface SSEConnection {
  token: string;
  url: string;
}

/**
 * Atomically obtain a token and bind its EventSource URL to the same backend
 * origin. This prevents a LAN/Tailscale route switch between token issuance
 * and URL construction from producing an invalid cross-route connection.
 */
export async function obtainSSEConnection(): Promise<SSEConnection> {
  const config = getApiConfig();
  if (!config.baseUrl) {
    throw new Error("Backend URL not configured");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/events/token`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["X-KAEL-KEY"] = config.apiKey;
  }

  const res = await fetch(url, { method: "POST", headers });
  if (!res.ok) {
    throw new Error(`SSE token request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (typeof data?.token !== "string" || !data.token) {
    throw new Error("SSE token response invalid");
  }
  return {
    token: data.token,
    url: buildSSEUrl(data.token, config.baseUrl),
  };
}

/**
 * Build the full EventSource URL with token query param.
 *
 * @example buildSSEUrl("abc123")
 * // → "<baseUrl>/chat/events?token=abc123"
 */
export function buildSSEUrl(token: string, baseUrl?: string): string {
  const resolvedBaseUrl = baseUrl ?? getApiConfig().baseUrl;
  return `${resolvedBaseUrl.replace(/\/$/, "")}/chat/events?token=${encodeURIComponent(token)}`;
}

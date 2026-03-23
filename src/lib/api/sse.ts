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
  return data.token;
}

/**
 * Build the full EventSource URL with token query param.
 *
 * @example buildSSEUrl("abc123")
 * // → "http://192.168.178.78:8002/chat/events?token=abc123"
 */
export function buildSSEUrl(token: string): string {
  const config = getApiConfig();
  return `${config.baseUrl.replace(/\/$/, "")}/chat/events?token=${encodeURIComponent(token)}`;
}

/**
 * Sentinel API client.
 *
 * The sentinel is a lightweight always-running server on port 8099
 * that can wake the main Kael backend via bootstrap_kael.py.
 *
 * Probe order mirrors the main backend: USB > LAN > Tailscale.
 */

const SENTINEL_PORT = 8099;

/** Known sentinel URLs — same hosts as the main backend but on :8099. */
const KNOWN_SENTINEL_URLS = [
  `http://127.0.0.1:${SENTINEL_PORT}`,      // USB via adb reverse
  `http://192.168.178.78:${SENTINEL_PORT}`,  // Home LAN
  `http://100.89.31.50:${SENTINEL_PORT}`,    // Tailscale VPN
];

const SENTINEL_TIMEOUT = 3000; // 3 seconds

export interface SentinelStatus {
  backend_alive: boolean;
  bootstrap_running: boolean;
  bootstrap_pid: number | null;
  last_result: string;
  last_start_time: number | null;
}

export interface SentinelStartResult {
  started: boolean;
  reason?: string;
  pid?: number;
}

/**
 * Probe sentinel URLs in parallel. Returns the first reachable URL or null.
 */
export async function probeSentinel(): Promise<string | null> {
  const probeOne = (url: string): Promise<string> =>
    fetch(`${url}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(SENTINEL_TIMEOUT),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      const body = await res.json();
      if (body?.status !== "sentinel_alive") {
        throw new Error(`${url} not a kael_sentinel`);
      }
      return url;
    });

  try {
    const results = await Promise.allSettled(KNOWN_SENTINEL_URLS.map(probeOne));
    const fulfilled = results.find((r) => r.status === "fulfilled");
    if (fulfilled && fulfilled.status === "fulfilled") return fulfilled.value;
    return null;
  } catch {
    return null;
  }
}

/**
 * Ask the sentinel to start the main backend.
 */
export async function requestBootstrap(sentinelUrl: string): Promise<SentinelStartResult> {
  const res = await fetch(`${sentinelUrl}/start`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  return res.json();
}

/**
 * Check backend status via the sentinel.
 */
export async function getSentinelStatus(sentinelUrl: string): Promise<SentinelStatus> {
  const res = await fetch(`${sentinelUrl}/status`, {
    method: "GET",
    signal: AbortSignal.timeout(SENTINEL_TIMEOUT),
  });
  return res.json();
}

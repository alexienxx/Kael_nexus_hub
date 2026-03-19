/**
 * Spotify OAuth 2.0 PKCE flow for public clients (no client secret needed).
 * Handles login, token refresh, and logout.
 */

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

// Scopes needed for full library + playback + playlist creation
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-recently-played",
  "user-top-read",
].join(" ");

const STORAGE_KEY = "kael-spotify-auth";
const VERIFIER_KEY = "kael-spotify-verifier";
const CLIENT_ID_KEY = "kael-spotify-client-id";

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // timestamp ms
  token_type: string;
}

// ─── Client ID management ───────────────────────────────

export function getSpotifyClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || "";
}

export function setSpotifyClientId(id: string) {
  localStorage.setItem(CLIENT_ID_KEY, id.trim());
}

// ─── Token storage ──────────────────────────────────────

export function getStoredTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeTokens(tokens: SpotifyTokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VERIFIER_KEY);
}

export function isTokenExpired(tokens: SpotifyTokens): boolean {
  return Date.now() >= tokens.expires_at - 60_000; // 1 min buffer
}

// ─── PKCE helpers ───────────────────────────────────────

function generateRandomString(length: number): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64urlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Auth flow ──────────────────────────────────────────

export async function startSpotifyLogin() {
  const clientId = getSpotifyClientId();
  if (!clientId) throw new Error("Spotify Client ID non configurato. Vai in Settings.");

  const verifier = generateRandomString(64);
  localStorage.setItem(VERIFIER_KEY, verifier);

  const challenge = base64urlEncode(await sha256(verifier));
  const redirectUri = getRedirectUri();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    show_dialog: "true",
  });

  window.location.href = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export async function handleSpotifyCallback(code: string): Promise<SpotifyTokens> {
  const clientId = getSpotifyClientId();
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — restart login flow.");

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  const tokens: SpotifyTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
  };

  storeTokens(tokens);
  localStorage.removeItem(VERIFIER_KEY);
  return tokens;
}

export async function refreshAccessToken(): Promise<SpotifyTokens> {
  const clientId = getSpotifyClientId();
  const current = getStoredTokens();
  if (!current?.refresh_token) throw new Error("No refresh token available.");

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: current.refresh_token,
    }),
  });

  if (!res.ok) {
    clearTokens();
    throw new Error("Token refresh failed — re-login required.");
  }

  const data = await res.json();
  const tokens: SpotifyTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || current.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
  };

  storeTokens(tokens);
  return tokens;
}

/**
 * Get a valid access token, refreshing if needed.
 */
export async function getValidToken(): Promise<string> {
  let tokens = getStoredTokens();
  if (!tokens) throw new Error("Not logged in to Spotify.");

  if (isTokenExpired(tokens)) {
    tokens = await refreshAccessToken();
  }

  return tokens.access_token;
}

export function isSpotifyLoggedIn(): boolean {
  const tokens = getStoredTokens();
  return !!tokens?.access_token;
}

export function logoutSpotify() {
  clearTokens();
}

// ─── Redirect URI ───────────────────────────────────────

function getRedirectUri(): string {
  return `${window.location.origin}/spotify-callback`;
}

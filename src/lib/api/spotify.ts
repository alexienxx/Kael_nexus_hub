import { apiRequest } from "./client";

/**
 * SPOTIFY API SERVICE LAYER
 *
 * Aligned with bounded backend Spotify contract.
 * Supported endpoints:
 * - GET  /spotify/context — Get now-playing + suggestions
 * - GET  /spotify/state   — Get Spotify connection state
 * - POST /spotify/state   — Update Spotify state (e.g., pause/play context)
 * - DELETE /spotify/state — Clear Spotify state
 *
 * ⚠️ NO /spotify/share endpoint — that does NOT exist on backend.
 */

export interface SpotifyTrack {
  title: string;
  artist: string;
  albumArt?: string;
  spotifyUrl?: string;
  previewUrl?: string;
}

export interface SpotifyContext {
  nowPlaying?: SpotifyTrack;
  suggestions?: SpotifyTrack[];
}

export interface SpotifyState {
  connected: boolean;
  active: boolean;
  lastSync?: string;
}

/** Get Spotify context — now playing + Kael suggestions */
export async function getSpotifyContext() {
  return apiRequest<SpotifyContext>("/spotify/context");
}

/** Get Spotify connection/playback state */
export async function getSpotifyState() {
  return apiRequest<SpotifyState>("/spotify/state");
}

/** Update Spotify state */
export async function updateSpotifyState(data: Partial<SpotifyState>) {
  return apiRequest<SpotifyState>("/spotify/state", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Clear Spotify state */
export async function clearSpotifyState() {
  return apiRequest<{ success: boolean }>("/spotify/state", {
    method: "DELETE",
  });
}

import { apiRequest } from "./client";
import type { SpotifyPlaybackState } from "@/lib/spotify/api";

/**
 * SPOTIFY API SERVICE LAYER
 *
 * Endpoints (Kael backend):
 * - GET  /spotify/context — Get now-playing + suggestions
 * - GET  /spotify/state   — Get Spotify connection state
 * - POST /spotify/state   — Update Spotify state
 * - DELETE /spotify/state — Clear Spotify state
 * - POST /spotify/playlist/create — Kael creates a playlist for the user
 * - POST /spotify/playlist/suggest — Kael suggests a playlist or tracks
 * - GET  /spotify/suggestions — Get Kael's track/playlist suggestions
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

export interface KaelPlaylistRequest {
  name: string;
  description?: string;
  trackUris?: string[];
  mood?: string;
  context?: string;
}

export interface KaelPlaylistResponse {
  playlistId: string;
  playlistUrl: string;
  name: string;
  trackCount: number;
}

export interface KaelMusicSuggestion {
  type: "track" | "playlist";
  track?: SpotifyTrack;
  playlist?: {
    name: string;
    description?: string;
    coverArt?: string;
    trackCount?: number;
    spotifyUrl?: string;
    createdByKael?: boolean;
  };
  message?: string;
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

/** Kael creates a playlist on the user's Spotify account */
export async function kaelCreatePlaylist(request: KaelPlaylistRequest) {
  return apiRequest<KaelPlaylistResponse>("/spotify/playlist/create", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/** Get Kael's music suggestions (tracks + playlists) */
export async function getKaelMusicSuggestions() {
  return apiRequest<{ suggestions: KaelMusicSuggestion[] }>("/spotify/suggestions");
}

/**
 * Push live playback state to Kael backend so it can use it as context
 * during chat. Maps SpotifyPlaybackState → UpdateStateRequest.
 * Fires-and-forgets: errors are swallowed to never break the player UI.
 */
export async function pushPlaybackToBackend(
  state: SpotifyPlaybackState | null,
): Promise<void> {
  if (!state?.item) return;
  const track = state.item;
  try {
    await apiRequest<unknown>("/spotify/state", {
      method: "POST",
      body: JSON.stringify({
        track_id: track.id ?? null,
        track_name: track.name ?? null,
        artist_name: track.artists?.map((a) => a.name).join(", ") ?? null,
        album_name: (track as any).album?.name ?? null,
        duration_ms: track.duration_ms ?? null,
        progress_ms: state.progress_ms ?? null,
        is_playing: state.is_playing,
        device_id: state.device?.id ?? null,
        device_name: state.device?.name ?? null,
        ttl_seconds: 60,
      }),
    });
  } catch {
    // Non-critical: ignore push failures silently
  }
}

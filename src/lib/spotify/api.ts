/**
 * Spotify Web API client.
 * Uses the PKCE access token from auth.ts.
 */

import { getValidToken } from "./auth";

const BASE = "https://api.spotify.com/v1";

async function spotifyFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getValidToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 204) return {} as T;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify API ${res.status}: ${body}`);
  }

  return res.json();
}

// ─── Types ──────────────────────────────────────────────

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrackFull {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  uri: string;
  external_urls: { spotify: string };
  duration_ms: number;
  preview_url: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  tracks: { total: number };
  external_urls: { spotify: string };
  owner: { display_name: string };
}

export interface SpotifyPlaybackState {
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrackFull | null;
  device?: {
    id: string;
    name: string;
    type: string;
    volume_percent: number;
  };
  shuffle_state: boolean;
  repeat_state: string;
}

// ─── Now Playing & Playback ─────────────────────────────

export async function getCurrentPlayback(): Promise<SpotifyPlaybackState | null> {
  try {
    return await spotifyFetch<SpotifyPlaybackState>("/me/player");
  } catch {
    return null;
  }
}

export async function play(options?: { uris?: string[]; context_uri?: string }) {
  await spotifyFetch("/me/player/play", {
    method: "PUT",
    body: options ? JSON.stringify(options) : undefined,
  });
}

export async function pause() {
  await spotifyFetch("/me/player/pause", { method: "PUT" });
}

export async function skipNext() {
  await spotifyFetch("/me/player/next", { method: "POST" });
}

export async function skipPrev() {
  await spotifyFetch("/me/player/previous", { method: "POST" });
}

export async function setVolume(percent: number) {
  await spotifyFetch(`/me/player/volume?volume_percent=${Math.round(percent)}`, { method: "PUT" });
}

export async function toggleShuffle(state: boolean) {
  await spotifyFetch(`/me/player/shuffle?state=${state}`, { method: "PUT" });
}

// ─── Library ────────────────────────────────────────────

export async function getSavedTracks(limit = 20, offset = 0) {
  return spotifyFetch<{ items: { track: SpotifyTrackFull }[]; total: number }>(
    `/me/tracks?limit=${limit}&offset=${offset}`
  );
}

export async function getMyPlaylists(limit = 20, offset = 0) {
  return spotifyFetch<{ items: SpotifyPlaylist[]; total: number }>(
    `/me/playlists?limit=${limit}&offset=${offset}`
  );
}

export async function getPlaylistTracks(playlistId: string, limit = 50, offset = 0) {
  return spotifyFetch<{ items: { track: SpotifyTrackFull }[]; total: number }>(
    `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`
  );
}

export async function getRecentlyPlayed(limit = 20) {
  return spotifyFetch<{ items: { track: SpotifyTrackFull; played_at: string }[] }>(
    `/me/player/recently-played?limit=${limit}`
  );
}

// ─── Playlist management (for Kael) ─────────────────────

export async function createPlaylist(
  userId: string,
  name: string,
  description?: string,
  isPublic = false
) {
  return spotifyFetch<SpotifyPlaylist>(`/users/${userId}/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: isPublic }),
  });
}

export async function addTracksToPlaylist(playlistId: string, uris: string[]) {
  return spotifyFetch<{ snapshot_id: string }>(`/playlists/${playlistId}/tracks`, {
    method: "POST",
    body: JSON.stringify({ uris }),
  });
}

export async function getCurrentUser() {
  return spotifyFetch<{ id: string; display_name: string; images: SpotifyImage[] }>("/me");
}

// ─── Search ─────────────────────────────────────────────

export async function searchTracks(query: string, limit = 10) {
  return spotifyFetch<{
    tracks: { items: SpotifyTrackFull[]; total: number };
  }>(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
}

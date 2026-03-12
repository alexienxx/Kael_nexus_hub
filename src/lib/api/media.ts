import { apiRequest } from "./client";
import type { MediaItem } from "@/types";

/** Get shared media gallery */
export async function getMediaGallery(type?: "image" | "video" | "audio") {
  const query = type ? `?type=${type}` : "";
  return apiRequest<{ items: MediaItem[] }>(`/media/gallery${query}`);
}

/** Request an avatar video from Kael */
export async function requestAvatarVideo(prompt?: string) {
  return apiRequest<{ videoId: string; status: string }>("/media/video/request", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

/** Check avatar video generation status */
export async function checkVideoStatus(videoId: string) {
  return apiRequest<{ status: string; url?: string }>(
    `/media/video/status?videoId=${videoId}`
  );
}

/** Get generated images */
export async function getGeneratedImages() {
  return apiRequest<{ items: MediaItem[] }>("/media/generated");
}

/** Get Spotify now-playing / suggestions */
export async function getSpotifyContext() {
  return apiRequest<{
    nowPlaying?: { title: string; artist: string; albumArt?: string; spotifyUrl?: string };
    suggestions?: Array<{ title: string; artist: string; albumArt?: string; spotifyUrl?: string }>;
  }>("/spotify/context");
}

/** Send current Spotify track to Kael for context */
export async function shareNowPlaying(trackData: {
  title: string;
  artist: string;
  spotifyUrl?: string;
}) {
  return apiRequest("/spotify/share", {
    method: "POST",
    body: JSON.stringify(trackData),
  });
}

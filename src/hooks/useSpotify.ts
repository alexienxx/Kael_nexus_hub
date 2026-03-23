import { useState, useEffect, useCallback, useRef } from "react";
import {
  isSpotifyLoggedIn,
  getStoredTokens,
  isTokenExpired,
  logoutSpotify,
  getSpotifyClientId,
} from "@/lib/spotify/auth";
import * as spotifyApi from "@/lib/spotify/api";
import { pushPlaybackToBackend } from "@/lib/api/spotify";

export type SpotifyConnectionState = "not_configured" | "disconnected" | "connected" | "error";

export function useSpotify() {
  const [connectionState, setConnectionState] = useState<SpotifyConnectionState>("disconnected");
  const [playback, setPlayback] = useState<spotifyApi.SpotifyPlaybackState | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Check initial state
  useEffect(() => {
    const clientId = getSpotifyClientId();
    if (!clientId) {
      setConnectionState("not_configured");
      return;
    }

    if (!isSpotifyLoggedIn()) {
      setConnectionState("disconnected");
      return;
    }

    const tokens = getStoredTokens();
    if (tokens && !isTokenExpired(tokens)) {
      setConnectionState("connected");
    } else {
      setConnectionState("disconnected");
    }
  }, []);

  // Poll playback state when connected
  const fetchPlayback = useCallback(async () => {
    if (connectionState !== "connected") return;
    try {
      const state = await spotifyApi.getCurrentPlayback();
      setPlayback(state);
      // Push now-playing to Kael backend for chat context (fire-and-forget)
      if (state?.is_playing) {
        pushPlaybackToBackend(state);
      }
    } catch {
      // Silent fail for polling
    }
  }, [connectionState]);

  useEffect(() => {
    if (connectionState === "connected") {
      fetchPlayback();
      pollRef.current = setInterval(fetchPlayback, 5000);
      setIsPolling(true);
    } else {
      setIsPolling(false);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connectionState, fetchPlayback]);

  const disconnect = useCallback(() => {
    logoutSpotify();
    setConnectionState("disconnected");
    setPlayback(null);
  }, []);

  const handlePlay = useCallback(async (opts?: { uris?: string[]; context_uri?: string }) => {
    await spotifyApi.play(opts);
    setTimeout(fetchPlayback, 300);
  }, [fetchPlayback]);

  const handlePause = useCallback(async () => {
    await spotifyApi.pause();
    setTimeout(fetchPlayback, 300);
  }, [fetchPlayback]);

  const handleNext = useCallback(async () => {
    await spotifyApi.skipNext();
    setTimeout(fetchPlayback, 500);
  }, [fetchPlayback]);

  const handlePrev = useCallback(async () => {
    await spotifyApi.skipPrev();
    setTimeout(fetchPlayback, 500);
  }, [fetchPlayback]);

  return {
    connectionState,
    setConnectionState,
    playback,
    isPolling,
    disconnect,
    play: handlePlay,
    pause: handlePause,
    next: handleNext,
    prev: handlePrev,
    refreshPlayback: fetchPlayback,
  };
}

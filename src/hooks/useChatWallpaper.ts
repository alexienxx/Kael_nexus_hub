import { useState, useCallback, useEffect } from "react";
import type {
  ConversationWallpaper,
  WallpaperDisplaySettings,
  WallpaperKaelMode,
} from "@/types/wallpaper";
import { DEFAULT_DISPLAY_SETTINGS } from "@/types/wallpaper";

const STORAGE_KEY = "kael-chat-wallpapers";

/**
 * Load all wallpapers from localStorage.
 */
function loadWallpapers(): Record<string, ConversationWallpaper> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

/**
 * Save all wallpapers to localStorage.
 */
function saveWallpapers(data: Record<string, ConversationWallpaper>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[Wallpaper] Failed to persist wallpapers:", e);
  }
}

/**
 * Per-conversation wallpaper hook.
 * Stores wallpaper settings keyed by conversationId in localStorage.
 */
export function useChatWallpaper(conversationId: string) {
  const [allWallpapers, setAllWallpapers] = useState<Record<string, ConversationWallpaper>>(loadWallpapers);

  const wallpaper = allWallpapers[conversationId] ?? null;

  // Persist on every change
  useEffect(() => {
    saveWallpapers(allWallpapers);
  }, [allWallpapers]);

  const setWallpaper = useCallback(
    (uri: string, kaelMode: WallpaperKaelMode, displaySettings?: Partial<WallpaperDisplaySettings>) => {
      setAllWallpapers((prev) => ({
        ...prev,
        [conversationId]: {
          conversationId,
          wallpaperUri: uri,
          kaelMode,
          displaySettings: { ...DEFAULT_DISPLAY_SETTINGS, ...displaySettings },
          lastUpdatedAt: new Date().toISOString(),
          // No backend upload endpoint exists yet — all modes are local-only.
          // When a backend wallpaper endpoint is added, gate on kaelMode here.
          syncStatus: "local_only",
        },
      }));
    },
    [conversationId]
  );

  const updateDisplaySettings = useCallback(
    (partial: Partial<WallpaperDisplaySettings>) => {
      setAllWallpapers((prev) => {
        const current = prev[conversationId];
        if (!current) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...current,
            displaySettings: { ...current.displaySettings, ...partial },
            lastUpdatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [conversationId]
  );

  const updateKaelMode = useCallback(
    (mode: WallpaperKaelMode) => {
      setAllWallpapers((prev) => {
        const current = prev[conversationId];
        if (!current) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...current,
            kaelMode: mode,
            // No backend upload endpoint — keep local_only regardless of mode.
            syncStatus: "local_only",
            lastUpdatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [conversationId]
  );

  const updateSyncStatus = useCallback(
    (status: import("@/types/wallpaper").WallpaperSyncStatus) => {
      setAllWallpapers((prev) => {
        const current = prev[conversationId];
        if (!current) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...current,
            syncStatus: status,
            lastUpdatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [conversationId]
  );

  const removeWallpaper = useCallback(() => {
    setAllWallpapers((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, [conversationId]);

  const resetDisplaySettings = useCallback(() => {
    updateDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
  }, [updateDisplaySettings]);

  return {
    wallpaper,
    setWallpaper,
    updateDisplaySettings,
    updateKaelMode,
    updateSyncStatus,
    removeWallpaper,
    resetDisplaySettings,
    hasWallpaper: !!wallpaper,
  };
}

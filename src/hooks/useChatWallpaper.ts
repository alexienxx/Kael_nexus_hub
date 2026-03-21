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
          syncStatus: kaelMode === "wallpaper_only" ? "local_only" : "pending_upload",
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
            syncStatus: mode === "wallpaper_only" ? "local_only" : "pending_upload",
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
    removeWallpaper,
    resetDisplaySettings,
    hasWallpaper: !!wallpaper,
  };
}

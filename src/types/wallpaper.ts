// ===== Chat Wallpaper Types =====

export type WallpaperFitMode = "cover" | "contain" | "fill";
export type WallpaperPosition = "center" | "top" | "bottom";
export type WallpaperKaelMode = "wallpaper_only" | "share_once" | "persistent_context";
export type WallpaperSyncStatus = "local_only" | "pending_upload" | "uploaded" | "failed";

export type BubbleWallpaperStyle =
  | "solid"        // default opaque bubbles
  | "glass"        // soft glass with blur
  | "gradient"     // extend wallpaper gradient into bubbles
  | "tinted";      // wallpaper-aware color tint

export interface WallpaperDisplaySettings {
  fitMode: WallpaperFitMode;
  position: WallpaperPosition;
  blurAmount: number;          // 0–40 px
  overlayStrength: number;     // 0–1
  dimness: number;             // 0–1
  extendGradientToBubbles: boolean;
  bubbleStyle: BubbleWallpaperStyle;
  bubbleBlurEnabled: boolean;
}

export interface ConversationWallpaper {
  conversationId: string;
  wallpaperUri: string;        // data URI or blob URL
  wallpaperAssetId?: string;   // future backend reference
  kaelMode: WallpaperKaelMode;
  displaySettings: WallpaperDisplaySettings;
  lastUpdatedAt: string;       // ISO timestamp
  syncStatus: WallpaperSyncStatus;
}

/** Future backend contract shape (not sent yet) */
export interface WallpaperVisualContext {
  conversation_id: string;
  source: "chat_wallpaper";
  mode: "share_once" | "persistent_context";
  active: boolean;
  asset_reference?: string;
}

/** Structured visual context that Kael can derive (future) */
export interface WallpaperAmbientContext {
  scene?: string;
  mood?: string;
  palette?: string[];
  symbols?: string[];
  short_summary?: string;
  embedding_ref?: string;
}

export const DEFAULT_DISPLAY_SETTINGS: WallpaperDisplaySettings = {
  fitMode: "cover",
  position: "center",
  blurAmount: 4,
  overlayStrength: 0.5,
  dimness: 0.3,
  extendGradientToBubbles: false,
  bubbleStyle: "solid",
  bubbleBlurEnabled: false,
};

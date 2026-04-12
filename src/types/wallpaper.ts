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

/** Backend response from POST /chat/wallpaper */
export interface WallpaperAnalysisResponse {
  ok: boolean;
  visual_summary: string;
  people_count: number;
  objects: string[];
  scene_type: string;
  text_detected?: string;
  identity_context: {
    alexien_present: boolean;
    kael_present: boolean;
    unknown_people_present: boolean;
    face_count: number;
    face_matching_available: boolean;
    match_details: Array<{ identity: string; distance: number; confident: boolean }>;
  };
  image_hash: string;
  mode: string;
  provider: string;
  elapsed_s: number;
  error?: string;
  trace_id?: string;
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

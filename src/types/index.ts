// ===== Chat Types =====
export interface ChatMessage {
  id: string;
  text: string;
  time: string;
  sender: "user" | "kael";
  image?: string;
  audioUrl?: string;
  audioDuration?: number;
  videoUrl?: string;
  trackCard?: TrackCard;
  feedback?: "like" | "dislike" | null;
  isProcessingImage?: boolean;
  isGenerating?: boolean;
}

export interface Conversation {
  id: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
}

// ===== Feedback =====
export interface FeedbackPayload {
  messageId: string;
  type: "like" | "dislike";
}

// ===== Voice / Call =====
export type CallState = "idle" | "ringing" | "incoming" | "active" | "ended";

export interface CallSession {
  id: string;
  state: CallState;
  startedAt?: string;
  duration?: number;
  transcript: TranscriptEntry[];
}

export interface TranscriptEntry {
  id: string;
  speaker: "user" | "kael";
  text: string;
  timestamp: string;
}

// ===== Media =====
export interface MediaItem {
  id: string;
  url: string;
  thumbnail?: string;
  type: "image" | "video" | "audio";
  sender: "user" | "kael";
  timestamp: string;
  caption?: string;
}

export interface TrackCard {
  title: string;
  artist: string;
  albumArt?: string;
  spotifyUrl?: string;
  previewUrl?: string;
}

// ===== Memories =====
export interface Memory {
  id: string;
  title: string;
  description: string;
  date: string;
  type: "milestone" | "moment" | "favorite" | "symbolic";
  imageUrl?: string;
  emotion?: string;
}

// ===== Theme / Customization =====
export interface ThemePreset {
  id: string;
  name: string;
  accentHue: number;
  bubbleStyle: BubbleStyle;
  backgroundOpacity: number;
  blurStrength: number;
}

export type BubbleStyle = "rounded" | "sharp" | "pill" | "cloud";

export interface ThemeSettings {
  accentHue: number;
  accentSaturation: number;
  bubbleColorHue: number;
  bubbleStyle: BubbleStyle;
  backgroundOpacity: number;
  blurStrength: number;
  backgroundImage: string | null;
  kaelAvatar: string | null;
  bubbleRadius: number;
  audioBarStyle: "bars" | "wave" | "dots" | "minimal";
  notificationSound: string;
}

// ===== Connection =====
export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "error";

// ===== Backend Config =====
export interface BackendConfig {
  baseUrl: string;
  apiKey: string;
}

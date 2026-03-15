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
  // Backend-specific fields
  backend_turn_id?: string;
  latency?: number;
  meta?: Record<string, unknown>;
  emotional_state?: string;
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

// ===== Services Hub =====
/**
 * Services Hub Type Definitions
 *
 * ⚠️ CRITICAL BACKEND DEPENDENCY:
 * These types define the contract between frontend and backend for the Services hub.
 * Backend endpoints (/services/*, /services/github/*) are NOT yet fully implemented.
 *
 * IMPORTANT RULES:
 * 1. Connection status MUST come from backend - NO frontend mocking
 * 2. Self-repo classification (is_self_repo) MUST come from backend
 * 3. NO local repo reasoning or heuristics in the UI
 * 4. UI is ONLY a selector/context layer for backend-provided data
 * 5. MUST fail gracefully when backend endpoints are unavailable
 */

export type ServiceProvider = "github" | "notion" | "drive" | "slack" | "calendar";
export type ConnectionState = "connected" | "not_connected" | "pending";

/**
 * Service definition - MUST be provided by backend
 */
export interface Service {
  id: string;
  provider: ServiceProvider;
  display_name: string;
  icon: string;
  connection_status: ConnectionState;
  account_label?: string;
  capabilities?: string[];
  scopes?: string[];
}

/**
 * GitHub action modes for repo-aware operations
 * Self-repo modes (self_repo_*) require is_self_repo=true from backend
 */
export type GitHubActionMode =
  | "browse"
  | "repo_scan"
  | "pr_review"
  | "issue_review"
  | "self_repo_scan"
  | "self_repo_diagnostics_correlation"
  | "issue_draft";

/**
 * Agentic service action request sent to backend
 */
export interface AgenticServiceAction {
  service_id: string;
  action: string;
  target: string;
  mode: GitHubActionMode;
  correlate_with_diagnostics?: boolean;
  draft_issue?: boolean;
}

/**
 * Context chip displayed in chat UI
 * Populated from backend-provided repo data
 */
export interface ServiceContextChip {
  provider: ServiceProvider;
  target_label: string;
  mode_label: string;
  self_repo: boolean;
}

/**
 * GitHub repository data provided by backend
 * CRITICAL: is_self_repo MUST be determined by backend, NOT by frontend
 */
export interface GitHubRepo {
  id: string;
  name: string;
  full_name: string;
  owner: string;
  is_self_repo: boolean; // Backend-determined, NOT frontend heuristic
  url: string;
  description?: string;
}

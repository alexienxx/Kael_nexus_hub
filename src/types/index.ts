export type DeliveryMode = "text" | "voice_note" | "image" | "video_message" | "voice_call";

// ===== Chat Types =====
export interface ChatMessage {
  id: string;
  text: string;
  time: string;
  /** Unix timestamp (seconds) for deterministic merge/sort ordering */
  timestamp?: number;
  sender: "user" | "kael" | "external_agent";
  image?: string;
  audioUrl?: string;
  audioDuration?: number;
  videoUrl?: string;
  trackCard?: TrackCard;
  playlistCard?: PlaylistCard;
  feedback?: "like" | "dislike" | null;
  feedbackCapReached?: boolean;
  isProcessingImage?: boolean;
  isGenerating?: boolean;
  /** Canonical delivery mode from backend — drives render priority */
  delivery_mode?: DeliveryMode;
  // External agent metadata (when sender === "external_agent")
  agent_id?: string;
  agent_name?: string;
  agent_avatar?: string;
  // Backend-specific fields
  backend_turn_id?: string;
  /**
   * Stable client-generated UUID sent with every message.
   * Used to reconcile the optimistic local message with the backend-persisted
   * turn on history reload — prevents duplicates without text-based heuristics.
   */
  client_message_id?: string;
  latency?: number;
  meta?: Record<string, unknown>;
  emotional_state?: string;
  /** True while the user is editing this message (dimmed in UI) */
  isEditing?: boolean;
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

export interface PlaylistCard {
  name: string;
  description?: string;
  coverArt?: string;
  trackCount?: number;
  spotifyUrl?: string;
  createdByKael?: boolean;
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

// ===== Backend Lifecycle =====
export type BackendLifecycleState =
  | "checking"            // Health probe in progress
  | "online"              // Backend healthy and reachable
  | "starting"            // Sentinel triggered bootstrap (only from Settings > Riavvia)
  | "waiting"             // Bootstrap launched, polling for health
  | "start_failed"        // Bootstrap timed out or failed
  | "offline"             // Backend was online but health checks failed
  | "offline_network"     // Device has no network connectivity
  | "backend_unreachable"; // All probe attempts exhausted, backend not reachable

// ===== Backend Config =====
export interface BackendConfig {
  baseUrl: string;
  apiKey: string;
}

// ===== Services Hub =====
/**
 * Services Hub Type Definitions
 *
 * ⚠️ IMPORTANT: Services Hub has TWO distinct integration surfaces:
 *
 * 1. GENERIC SERVICE OPERATIONS (NOT YET IMPLEMENTED):
 *    - Service listing, connection/disconnection
 *    - OAuth flows for third-party services
 *    - Endpoints: /services/*, /services/:id/connect, etc.
 *    - Status: PENDING BACKEND IMPLEMENTATION
 *
 * 2. REPO-AWARENESS OPERATIONS (ACTUAL BACKEND CONTRACT):
 *    ✅ GitHub repo-aware operations
 *    ✅ Self-repo analysis and diagnostics correlation
 *    ✅ Issue drafting based on analysis
 *    - Endpoints: /agentic/repo/status, /agentic/repo/analyze, /agentic/repo/self_audit, /agentic/repo/draft_issue
 *    - Status: ALIGNED WITH BACKEND IMPLEMENTATION
 *
 * IMPORTANT RULES:
 * 1. Connection status for generic services MUST come from backend - NO frontend mocking
 * 2. Self-repo classification (is_self_repo) MUST come from backend repo-awareness endpoints
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
  mode_label: GitHubActionMode;
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

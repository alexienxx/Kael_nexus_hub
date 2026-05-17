import { useRef } from "react";
import { useTheme } from "@/lib/store/theme";
import MessageActions from "./MessageActions";
import AudioMessage from "./AudioMessage";
import ImageMessage from "./ImageMessage";
import BubbleContextMenu from "./BubbleContextMenu";
import AssistantMarkdown from "./AssistantMarkdown";
import PlaylistCard from "./PlaylistCard";
import TrackCard from "@/components/media/TrackCard";
import SpotifyIcon from "@/components/common/SpotifyIcon";
import type { ChatMessage } from "@/types";
import type { WallpaperDisplaySettings, BubbleWallpaperStyle } from "@/types/wallpaper";

interface MessageBubbleProps {
  message: ChatMessage;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onPlayTTS?: (text: string) => void;
  onImageClick?: (url: string) => void;
  onEditMessage?: (id: string, currentText: string) => void;
  onSwipeReply?: (message: ChatMessage) => void;
  wallpaperStyle?: WallpaperDisplaySettings | null;
}

/**
 * Get bubble CSS based on wallpaper style mode.
 * Keeps bubbles readable while allowing atmosphere inheritance.
 */
function getBubbleWallpaperCSS(
  isUser: boolean,
  isExternalAgent: boolean,
  style: WallpaperDisplaySettings | null,
  theme: { bubbleRadius: number; bubbleColorHue: number }
): React.CSSProperties {
  const base: React.CSSProperties = {};

  if (!style) return base;

  const mode = style.bubbleStyle;

  if (mode === "glass") {
    base.background = isUser
      ? `hsl(${theme.bubbleColorHue} 60% 45% / 0.35)`
      : isExternalAgent
        ? "rgba(0, 180, 255, 0.1)"
        : "hsl(var(--glass) / 0.4)";
    base.backdropFilter = `blur(${style.bubbleBlurEnabled ? 16 : 0}px)`;
    (base as any).WebkitBackdropFilter = base.backdropFilter;
  } else if (mode === "gradient" && style.extendGradientToBubbles) {
    base.background = isUser
      ? `linear-gradient(135deg, hsl(${theme.bubbleColorHue} 60% 45% / 0.5), hsl(${theme.bubbleColorHue} 80% 35% / 0.3))`
      : isExternalAgent
        ? "linear-gradient(135deg, rgba(0, 180, 255, 0.12), rgba(0, 120, 255, 0.08))"
        : "linear-gradient(135deg, hsl(var(--glass) / 0.5), hsl(var(--glass) / 0.3))";
    if (style.bubbleBlurEnabled) {
      base.backdropFilter = "blur(12px)";
      (base as any).WebkitBackdropFilter = "blur(12px)";
    }
  } else if (mode === "tinted") {
    base.background = isUser
      ? `hsl(${theme.bubbleColorHue} 50% 40% / 0.55)`
      : isExternalAgent
        ? "rgba(0, 180, 255, 0.12)"
        : "hsl(var(--glass) / 0.5)";
    if (style.bubbleBlurEnabled) {
      base.backdropFilter = "blur(10px)";
      (base as any).WebkitBackdropFilter = "blur(10px)";
    }
  }
  // "solid" mode = default behavior, no special CSS

  return base;
}

const downloadFile = (url: string, filename: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const MessageBubble = ({
  message,
  onLike,
  onDislike,
  onPlayTTS,
  onImageClick,
  onEditMessage,
  onSwipeReply,
  wallpaperStyle = null,
}: MessageBubbleProps) => {
  const { theme, kaelAvatarSrc } = useTheme();
  const isUser = message.sender === "user";
  const isExternalAgent = message.sender === "external_agent";

  const getSenderInfo = () => {
    if (isUser) return { name: null, avatar: null };
    if (isExternalAgent) {
      return {
        name: message.agent_name || "External Agent",
        avatar: message.agent_avatar || null,
      };
    }
    return { name: "Kael", avatar: kaelAvatarSrc };
  };

  const senderInfo = getSenderInfo();

  const bubbleStyle: React.CSSProperties = {
    borderRadius: isUser
      ? `${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px ${theme.bubbleRadius}px`
      : `${theme.bubbleRadius}px ${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px`,
  };

  // Default backgrounds
  const userBubbleBg = `hsl(${theme.bubbleColorHue} 60% 45% / 0.7)`;
  const externalAgentBg = "rgba(0, 180, 255, 0.15)";

  // Wallpaper-aware overrides
  const wallpaperCSS = getBubbleWallpaperCSS(isUser, isExternalAgent, wallpaperStyle, theme);
  const hasWallpaperOverride = wallpaperStyle && wallpaperStyle.bubbleStyle !== "solid";
  const hasPlayableAudio =
    typeof message.audioUrl === "string" &&
    /^(data:audio|https?:\/\/|blob:)/i.test(message.audioUrl);
  const voiceUnavailableFallback =
    message.delivery_mode === "voice_note" &&
    !hasPlayableAudio &&
    !message.text &&
    (!message.bubbles || message.bubbles.length === 0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!onSwipeReply || !touchStartRef.current) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const HORIZONTAL_SWIPE_THRESHOLD = 72;
    const MAX_VERTICAL_DRIFT = 42;
    if (deltaX > HORIZONTAL_SWIPE_THRESHOLD && Math.abs(deltaY) <= MAX_VERTICAL_DRIFT) {
      onSwipeReply(message);
    }
  };

  return (
    <BubbleContextMenu
      message={message}
      onEditMessage={onEditMessage}
      onDownloadImage={(url) => downloadFile(url, `kael-image-${Date.now()}.jpg`)}
      onDownloadAudio={(url) => downloadFile(url, `kael-audio-${Date.now()}.webm`)}
      onSaveToGallery={async (type, dataUrl) => {
        try {
          // Extract base64 from data URL (data:image/png;base64,...) or raw URL
          let b64 = dataUrl;
          if (dataUrl.startsWith("data:")) {
            b64 = dataUrl.split(",")[1] || "";
          } else if (dataUrl.startsWith("http")) {
            // Fetch and convert to base64
            const resp = await fetch(dataUrl);
            const blob = await resp.blob();
            b64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(",")[1] || "");
              reader.readAsDataURL(blob);
            });
          }
          const { saveToGallery } = await import("@/lib/api/media");
          await saveToGallery({ type, data_b64: b64, source: "chat_save" });
          const { toast } = await import("sonner");
          toast.success("Salvato in galleria");
        } catch {
          const { toast } = await import("sonner");
          toast.error("Errore salvataggio in galleria");
        }
      }}
    >
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} group ${message.isEditing ? "opacity-40 scale-[0.98] transition-all duration-200" : ""}`}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStartCapture={handleTouchStart}
      onTouchEndCapture={handleTouchEnd}
    >
      {!isUser && senderInfo.avatar && (
        <img
          src={senderInfo.avatar}
          alt={senderInfo.name || "Avatar"}
          className="mr-2 h-8 w-8 shrink-0 self-end rounded-full object-cover"
        />
      )}
      {!isUser && !senderInfo.avatar && (
        <div className="mr-2 h-8 w-8 shrink-0 self-end rounded-full bg-neon-blue/30 flex items-center justify-center text-xs font-bold text-neon-blue">
          {(senderInfo.name || "A").charAt(0).toUpperCase()}
        </div>
      )}
      <div className="max-w-[75%] flex flex-col">
        <div
          className={`px-4 py-2.5 ${
            isUser && !hasWallpaperOverride ? "backdrop-blur-sm" : ""
          } ${!isUser && !hasWallpaperOverride ? "glass" : ""}`}
          style={{
            ...bubbleStyle,
            ...(isUser && !hasWallpaperOverride ? { background: userBubbleBg } : {}),
            ...(isExternalAgent && !hasWallpaperOverride ? { background: externalAgentBg } : {}),
            ...wallpaperCSS,
          }}
        >
          {!isUser && senderInfo.name && (
            <p className={`mb-0.5 text-[11px] font-semibold ${
              isExternalAgent ? "text-neon-blue" : "text-neon-purple"
            } neon-text-subtle`}>
              {senderInfo.name}
            </p>
          )}

          {message.isProcessingImage && (
            <p className="text-xs italic text-muted-foreground mb-1">
              Kael sta guardando la tua foto...
            </p>
          )}

          {/* Render priority based on delivery_mode:
              voice_note → audio first, hide text
              image → image first, text below
              video_message → video first, text below
              text (default) → show all present media + text */}

          {message.image && (
            <ImageMessage
              src={message.image}
              alt="Shared image"
              onClick={() => onImageClick?.(message.image!)}
            />
          )}

          {hasPlayableAudio && (
            <AudioMessage
              src={message.audioUrl!}
              duration={message.audioDuration}
              sender={message.sender}
            />
          )}

          {message.videoUrl && (
            <div className="mb-2 overflow-hidden rounded-lg">
              <video
                src={message.videoUrl}
                controls
                className="max-h-48 w-full rounded-lg"
              />
            </div>
          )}

          {message.trackCard && (
            <div className="mb-2">
              <TrackCard
                title={message.trackCard.title}
                artist={message.trackCard.artist}
                albumArt={message.trackCard.albumArt}
                spotifyUrl={message.trackCard.spotifyUrl}
              />
            </div>
          )}

          {message.playlistCard && (
            <div className="mb-2">
              <PlaylistCard playlist={message.playlistCard} />
            </div>
          )}

          {message.bubbles && message.bubbles.length > 0 && !(message.delivery_mode === "voice_note" && hasPlayableAudio) ? (
            <div className="space-y-2">
              {message.bubbles.map((bubble, index) => (
                <div
                  key={`${message.id}-bubble-${index}`}
                  className="rounded-2xl bg-background/20 px-3 py-2"
                >
                  <AssistantMarkdown content={bubble} />
                </div>
              ))}
            </div>
          ) : message.text && !(message.delivery_mode === "voice_note" && hasPlayableAudio) && (
            isUser ? (
              <p className="text-sm leading-relaxed text-foreground">{message.text}</p>
            ) : (
              <AssistantMarkdown content={message.text} />
            )
          )}

          {voiceUnavailableFallback && (
            <p className="text-xs italic text-muted-foreground">
              Vocale non disponibile.
            </p>
          )}

          <div className={`mt-1 flex items-center gap-1 ${isUser ? "justify-end" : ""}`}>
            <p className="text-[10px] text-foreground/40">{message.time}</p>
          </div>
        </div>

        <MessageActions
          message={message}
          onLike={onLike}
          onDislike={onDislike}
          onPlayTTS={onPlayTTS}
        />
      </div>
    </div>
    </BubbleContextMenu>
  );
};

export default MessageBubble;

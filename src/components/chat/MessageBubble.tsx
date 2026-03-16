import { useTheme } from "@/lib/store/theme";
import MessageActions from "./MessageActions";
import AudioMessage from "./AudioMessage";
import ImageMessage from "./ImageMessage";
import AssistantMarkdown from "./AssistantMarkdown";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onPlayTTS?: (text: string) => void;
  onImageClick?: (url: string) => void;
}

const MessageBubble = ({
  message,
  onLike,
  onDislike,
  onRegenerate,
  onPlayTTS,
  onImageClick,
}: MessageBubbleProps) => {
  const { theme, kaelAvatarSrc } = useTheme();
  const isUser = message.sender === "user";
  const isExternalAgent = message.sender === "external_agent";
  const isKael = message.sender === "kael";

  // Get display name and avatar for the sender
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

  const bubbleStyle = {
    borderRadius: isUser
      ? `${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px ${theme.bubbleRadius}px`
      : `${theme.bubbleRadius}px ${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px`,
  };

  const userBubbleBg = `hsl(${theme.bubbleColorHue} 60% 45% / 0.7)`;
  // External agent gets neon-blue styling as specified in requirements
  const externalAgentBg = "rgba(0, 180, 255, 0.15)";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
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
            isUser ? "backdrop-blur-sm" : "glass"
          }`}
          style={{
            ...bubbleStyle,
            ...(isUser ? { background: userBubbleBg } : {}),
            ...(isExternalAgent ? { background: externalAgentBg } : {}),
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

          {message.image && (
            <ImageMessage
              src={message.image}
              alt="Shared image"
              onClick={() => onImageClick?.(message.image!)}
            />
          )}

          {message.audioUrl && (
            <AudioMessage
              src={message.audioUrl}
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
            <div className="mb-2 flex items-center gap-3 rounded-lg bg-background/30 p-2">
              {message.trackCard.albumArt && (
                <img
                  src={message.trackCard.albumArt}
                  alt={message.trackCard.title}
                  className="h-12 w-12 rounded-md object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{message.trackCard.title}</p>
                <p className="truncate text-xs text-muted-foreground">{message.trackCard.artist}</p>
              </div>
              {message.trackCard.spotifyUrl && (
                <a
                  href={message.trackCard.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-green-400 hover:underline"
                >
                  Apri
                </a>
              )}
            </div>
          )}

          {message.text && (
            isUser ? (
              <p className="text-sm leading-relaxed text-foreground">{message.text}</p>
            ) : (
              <AssistantMarkdown content={message.text} />
            )
          )}

          <div className={`mt-1 flex items-center gap-1 ${isUser ? "justify-end" : ""}`}>
            <p className="text-[10px] text-foreground/40">{message.time}</p>
          </div>
        </div>

        <MessageActions
          message={message}
          onLike={onLike}
          onDislike={onDislike}
          onRegenerate={onRegenerate}
          onPlayTTS={onPlayTTS}
        />
      </div>
    </div>
  );
};

export default MessageBubble;

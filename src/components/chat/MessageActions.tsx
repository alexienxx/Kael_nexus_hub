import { ThumbsUp, ThumbsDown, RefreshCw, Volume2, Download } from "lucide-react";
import type { ChatMessage } from "@/types";

interface MessageActionsProps {
  message: ChatMessage;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onPlayTTS?: (text: string) => void;
}

const MessageActions = ({ message, onLike, onDislike, onRegenerate, onPlayTTS }: MessageActionsProps) => {
  // Show actions for Kael and external agent messages, but not for user messages
  if (message.sender === "user") return null;

  return (
    <div className="mt-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
      {!message.feedbackCapReached && (
        <>
          <button
            onClick={() => onLike?.(message.id)}
            className={`rounded-full p-1 transition-all hover:scale-110 ${
              message.feedback === "like"
                ? "text-neon-purple bg-neon-purple/15"
                : "text-muted-foreground hover:text-neon-purple"
            }`}
            title="Mi piace"
          >
            <ThumbsUp size={12} />
          </button>
          <button
            onClick={() => onDislike?.(message.id)}
            className={`rounded-full p-1 transition-all hover:scale-110 ${
              message.feedback === "dislike"
                ? "text-destructive bg-destructive/15"
                : "text-muted-foreground hover:text-destructive"
            }`}
            title="Non mi piace"
          >
            <ThumbsDown size={12} />
          </button>
        </>
      )}
      <button
        onClick={() => onRegenerate?.(message.id)}
        className="rounded-full p-1 text-muted-foreground transition-all hover:scale-110 hover:text-foreground"
        title="Rigenera"
      >
        <RefreshCw size={12} />
      </button>
      {message.text && (
        <button
          onClick={() => onPlayTTS?.(message.text)}
          className="rounded-full p-1 text-muted-foreground transition-all hover:scale-110 hover:text-neon-blue"
          title="Ascolta"
        >
          <Volume2 size={12} />
        </button>
      )}
    </div>
  );
};

export default MessageActions;

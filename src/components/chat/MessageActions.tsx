import { useState } from "react";
import { ThumbsUp, ThumbsDown, Volume2, Download } from "lucide-react";
import type { ChatMessage } from "@/types";

interface MessageActionsProps {
  message: ChatMessage;
  onLike?: (id: string) => void;
  onDislike?: (id: string) => void;
  onPlayTTS?: (text: string) => void;
}

const MessageActions = ({ message, onLike, onDislike, onPlayTTS }: MessageActionsProps) => {
  const [confirmDislike, setConfirmDislike] = useState(false);

  // Show actions for Kael and external agent messages, but not for user messages
  if (message.sender === "user") return null;

  return (
    <div className="relative mt-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
            onClick={() => setConfirmDislike(true)}
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
      {message.text && (
        <button
          onClick={() => onPlayTTS?.(message.text)}
          className="rounded-full p-1 text-muted-foreground transition-all hover:scale-110 hover:text-neon-blue"
          title="Ascolta"
        >
          <Volume2 size={12} />
        </button>
      )}

      {/* Dislike confirmation popup */}
      {confirmDislike && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setConfirmDislike(false)} />
          <div className="absolute bottom-7 left-0 z-50 min-w-[200px] rounded-xl border border-destructive/30 bg-popover p-3 shadow-lg animate-in fade-in-0 zoom-in-95">
            <p className="text-xs text-foreground mb-2.5">
              Sei sicura del feedback negativo?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onDislike?.(message.id);
                  setConfirmDislike(false);
                }}
                className="flex-1 rounded-lg bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25"
              >
                Sì
              </button>
              <button
                onClick={() => setConfirmDislike(false)}
                className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80"
              >
                No
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MessageActions;

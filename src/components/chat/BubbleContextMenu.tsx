import { useState } from "react";
import { Pencil, Download, Share2 } from "lucide-react";
import { useLongPress } from "@/hooks/useLongPress";
import type { ChatMessage } from "@/types";

interface BubbleContextMenuProps {
  message: ChatMessage;
  children: React.ReactNode;
  onEditMessage?: (id: string, currentText: string) => void;
  onDownloadImage?: (url: string) => void;
  onDownloadAudio?: (url: string) => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

const BubbleContextMenu = ({
  message,
  children,
  onEditMessage,
  onDownloadImage,
  onDownloadAudio,
}: BubbleContextMenuProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition>({ x: 0, y: 0 });

  const isUser = message.sender === "user";
  const hasImage = !!message.image && !isUser;
  const hasAudio = !!message.audioUrl && !isUser;

  // Only enable if there's something to show
  const hasActions = (isUser && !!message.text) || hasImage || hasAudio;

  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      if (!hasActions) return;
      e.stopPropagation();
      e.preventDefault();

      let x: number, y: number;
      if ("touches" in e && e.touches.length > 0) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else if ("clientX" in e) {
        x = (e as React.MouseEvent).clientX;
        y = (e as React.MouseEvent).clientY;
      } else {
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }

      setMenuPos({ x, y });
      setMenuOpen(true);
    },
    delay: 500,
  });

  const handleEdit = () => {
    setMenuOpen(false);
    if (message.text) onEditMessage?.(message.id, message.text);
  };

  const handleDownloadImage = () => {
    setMenuOpen(false);
    if (message.image) {
      onDownloadImage?.(message.image);
    }
  };

  const handleDownloadAudio = () => {
    setMenuOpen(false);
    if (message.audioUrl) {
      onDownloadAudio?.(message.audioUrl);
    }
  };

  // Clamp menu position to viewport
  const clampedX = Math.min(menuPos.x, window.innerWidth - 200);
  const clampedY = Math.min(menuPos.y, window.innerHeight - 120);

  return (
    <>
      <div {...(hasActions ? longPressHandlers : {})} style={{ touchAction: "pan-y" }}>
        {children}
      </div>

      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setMenuOpen(false)}
            onTouchStart={() => setMenuOpen(false)}
          />
          {/* Context menu */}
          <div
            className="fixed z-[101] min-w-[180px] rounded-xl border border-border/50 bg-background/95 p-1 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95"
            style={{ left: clampedX, top: clampedY }}
          >
            {isUser && message.text && (
              <button
                onClick={handleEdit}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Pencil size={15} className="text-neon-purple" />
                Modifica messaggio
              </button>
            )}
            {hasImage && (
              <button
                onClick={handleDownloadImage}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Download size={15} className="text-neon-blue" />
                Scarica immagine
              </button>
            )}
            {hasAudio && (
              <button
                onClick={handleDownloadAudio}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Download size={15} className="text-neon-blue" />
                Scarica audio
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default BubbleContextMenu;

import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { useLongPress } from "@/hooks/useLongPress";
import ConnectionBadge from "@/components/common/ConnectionBadge";
import type { BackendLifecycleState } from "@/types";
import { toast } from "sonner";

interface KaelHeaderProps {
  title?: string;
  subtitle?: string;
  showStatus?: boolean;
  showBack?: boolean;
  rightContent?: React.ReactNode;
  lifecycleState?: BackendLifecycleState;
  lifecycleMessage?: string;
}

function dotColorClass(state: BackendLifecycleState): string {
  switch (state) {
    case "online":
      return "bg-online";
    case "starting":
    case "waiting":
    case "checking":
      return "bg-red-500 animate-pulse";
    case "start_failed":
      return "bg-destructive";
    case "offline":
    default:
      return "bg-red-500";
  }
}

const KaelHeader = ({
  title = "Kael",
  subtitle,
  showStatus = true,
  showBack = false,
  rightContent,
  lifecycleState = "offline",
  lifecycleMessage,
}: KaelHeaderProps) => {
  const navigate = useNavigate();
  const { kaelAvatarSrc, updateTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        updateTheme({ kaelAvatar: dataUrl });
        toast.success("Foto di Kael aggiornata ✨");
      }
    };
    reader.onerror = () => toast.error("Impossibile leggere l'immagine");
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const avatarLongPress = useLongPress({
    onLongPress: () => fileInputRef.current?.click(),
    delay: 500,
  });

  return (
    <header className="glass-strong relative z-10 flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative" {...avatarLongPress}>
          <img
            src={kaelAvatarSrc}
            alt="Kael"
            className="h-11 w-11 rounded-full object-cover ring-2 ring-neon-purple/50 neon-pulse cursor-pointer"
          />
          {showStatus && (
            <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${dotColorClass(lifecycleState)}`} />
          )}
        </div>
        <div>
          <h1 className="neon-text font-display text-xl font-extrabold tracking-tight text-neon-purple">
            {title}
          </h1>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          {showStatus && !subtitle && (
            <ConnectionBadge lifecycleState={lifecycleState} message={lifecycleMessage} />
          )}
        </div>
      </div>
      {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}

      {/* Hidden file input for avatar change */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFile}
      />
    </header>
  );
};

export default KaelHeader;

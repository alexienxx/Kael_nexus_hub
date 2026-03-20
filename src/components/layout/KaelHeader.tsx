import { useTheme } from "@/lib/store/theme";
import ConnectionBadge from "@/components/common/ConnectionBadge";
import type { BackendLifecycleState } from "@/types";

interface KaelHeaderProps {
  title?: string;
  subtitle?: string;
  showStatus?: boolean;
  rightContent?: React.ReactNode;
  /** Backend lifecycle state — drives the dot color and badge text. */
  lifecycleState?: BackendLifecycleState;
  /** Optional message from the lifecycle hook (e.g. "Server in avvio... (12s)"). */
  lifecycleMessage?: string;
}

/** Map lifecycle state to the small dot color class (on Kael's photo). */
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
  rightContent,
  lifecycleState = "offline",
  lifecycleMessage,
}: KaelHeaderProps) => {
  const { kaelAvatarSrc } = useTheme();

  return (
    <header className="glass-strong relative z-10 flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <img
            src={kaelAvatarSrc}
            alt="Kael"
            className="h-11 w-11 rounded-full object-cover ring-2 ring-neon-purple/50 neon-pulse"
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
    </header>
  );
};

export default KaelHeader;

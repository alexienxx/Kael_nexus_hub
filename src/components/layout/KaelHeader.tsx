import { useTheme } from "@/lib/store/theme";
import ConnectionBadge from "@/components/common/ConnectionBadge";

interface KaelHeaderProps {
  title?: string;
  subtitle?: string;
  showStatus?: boolean;
  rightContent?: React.ReactNode;
}

const KaelHeader = ({ title = "Kael", subtitle, showStatus = true, rightContent }: KaelHeaderProps) => {
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
            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-online" />
          )}
        </div>
        <div>
          <h1 className="neon-text font-display text-xl font-extrabold tracking-tight text-neon-purple">
            {title}
          </h1>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          {showStatus && !subtitle && <ConnectionBadge />}
        </div>
      </div>
      {rightContent && <div className="flex items-center gap-2">{rightContent}</div>}
    </header>
  );
};

export default KaelHeader;

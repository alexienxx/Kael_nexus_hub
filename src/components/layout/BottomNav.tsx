import { useState } from "react";
import { NavLink as RouterNavLink } from "react-router-dom";
import { MessageCircle, Paperclip, FolderKanban, Settings, Bot, RefreshCw } from "lucide-react";
import NetharionButton from "@/components/common/NetharionButton";
import NetharionRealEventsSheet from "@/components/common/NetharionRealEventsSheet";
import SpotifyIcon from "@/components/common/SpotifyIcon";
import { useBackendConnection } from "@/context/BackendConnectionContext";
import { useNetharion } from "@/hooks/useNetharion";
import type { BackendLifecycleState } from "@/types";

const navItems = [
  { to: "/", icon: MessageCircle, label: "Chat" },
  { to: "/media", icon: Paperclip, label: "Allegati" },
  { to: "/external-agent", icon: Bot, label: "Agent" },
  { to: "/workspace", icon: FolderKanban, label: "Workspace" },
  
  { to: "/settings", icon: Settings, label: "Settings" },
];

function statusDotClass(state: BackendLifecycleState): string {
  switch (state) {
    case "online":
      return "bg-green-500";
    case "checking":
    case "starting":
    case "waiting":
      return "bg-yellow-400 animate-pulse";
    case "start_failed":
    case "offline":
    default:
      return "bg-red-500";
  }
}

/** Small reconnect button with colored status dot. */
const ReconnectButton = () => {
  const { state, retry } = useBackendConnection();
  const isConnecting = state === "checking" || state === "starting" || state === "waiting";

  return (
    <button
      onClick={retry}
      disabled={isConnecting}
      className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] text-muted-foreground transition-all hover:text-foreground active:scale-95 disabled:opacity-50 relative"
      aria-label={state === "online" ? "Backend online" : "Riconnetti backend"}
    >
      {/* Status dot — absolute top-right on the icon */}
      <div className="relative">
        <RefreshCw
          size={20}
          className={isConnecting ? "animate-spin" : ""}
        />
        <span
          className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${statusDotClass(state)}`}
        />
      </div>
      <span className="font-normal">
        {state === "online" ? "Online" : state === "start_failed" ? "Errore" : "Backend"}
      </span>
    </button>
  );
};

const BottomNav = () => {
  const { state: backendState } = useBackendConnection();
  const { state: netharionState } = useNetharion(5000, backendState === "online");
  const [showRealEvents, setShowRealEvents] = useState(false);

  const handleSpotifyPress = () => {
    const spotifyDeepLink = "spotify://";
    const spotifyWeb = "https://open.spotify.com";
    const isCapacitor = !!(window as any).Capacitor;
    if (isCapacitor) {
      window.location.href = spotifyDeepLink;
      setTimeout(() => {
        window.open(spotifyWeb, "_blank");
      }, 1500);
    } else {
      window.open(spotifyWeb, "_blank");
    }
  };

  return (
    <nav className="glass-strong relative z-20 flex items-center justify-around px-1 py-1.5 safe-bottom">
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-30">
        <NetharionButton
          state={netharionState}
          onLongPress={() => setShowRealEvents(true)}
        />
      </div>
      <NetharionRealEventsSheet
        open={showRealEvents}
        onClose={() => setShowRealEvents(false)}
      />
      {navItems.map(({ to, icon: Icon, label }) => (
        <RouterNavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] transition-all ${
              isActive
                ? "text-neon-purple scale-105"
                : "text-muted-foreground hover:text-foreground"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} className={isActive ? "neon-text-subtle" : ""} />
              <span className={isActive ? "font-semibold" : "font-normal"}>{label}</span>
            </>
          )}
        </RouterNavLink>
      ))}

      {/* Spotify quick-launch button */}
      <button
        onClick={handleSpotifyPress}
        className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] text-muted-foreground transition-all hover:text-green-400 active:scale-95"
        aria-label="Apri Spotify"
      >
        <SpotifyIcon size={20} />
        <span className="font-normal">Spotify</span>
      </button>

      {/* Backend reconnect button with status dot */}
      <ReconnectButton />
    </nav>
  );
};

export default BottomNav;

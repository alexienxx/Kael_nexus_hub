import { useState } from "react";
import { NavLink as RouterNavLink, useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Paperclip,
  FolderKanban,
  Settings,
  RefreshCw,
  Bot,
} from "lucide-react";
import NetharionButton from "@/components/common/NetharionButton";
import NetharionRealEventsSheet from "@/components/common/NetharionRealEventsSheet";
import SpotifyIcon from "@/components/common/SpotifyIcon";
import { useBackendConnection } from "@/context/backend-connection";
import { useNetharion } from "@/hooks/useNetharion";
import type { BackendLifecycleState } from "@/types";
import { Capacitor } from "@capacitor/core";

const navItems = [
  { to: "/", icon: MessageCircle, label: "Chat" },
  { to: "/media", icon: Paperclip, label: "Allegati" },
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
    case "offline_network":
      return "bg-orange-400";
    case "start_failed":
    case "backend_unreachable":
    case "offline":
    default:
      return "bg-red-500";
  }
}

const ReconnectButton = () => {
  const { state, retry } = useBackendConnection();
  const isRetrying = state === "checking";

  return (
    <button
      type="button"
      onClick={() => retry()}
      disabled={isRetrying}
      className="absolute right-2 top-2 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-muted-foreground shadow-sm transition-all hover:text-foreground active:scale-95 disabled:opacity-50"
      aria-label={state === "online" ? "Backend online" : "Riconnetti al backend"}
    >
      <div className="relative">
        <RefreshCw size={18} className={isRetrying ? "animate-spin" : ""} />
        <span
          className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-background ${statusDotClass(state)}`}
        />
      </div>
    </button>
  );
};

const BottomNav = () => {
  const { state: backendState } = useBackendConnection();
  const { state: netharionState } = useNetharion(5000, backendState === "online");
  const [showRealEvents, setShowRealEvents] = useState(false);
  const [agentActive, setAgentActive] = useState(false);
  const navigate = useNavigate();

  const handleAgentToggle = () => {
    const next = !agentActive;
    setAgentActive(next);
    window.dispatchEvent(
      new CustomEvent("kael-agent-mode-changed", { detail: { active: next } }),
    );
    if (next) navigate("/");
  };

  const handleSpotifyPress = () => {
    const spotifyDeepLink = "spotify://";
    const spotifyWeb = "https://open.spotify.com";
    const isCapacitor = Capacitor.isNativePlatform();
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
    <nav className="glass-strong relative z-20 px-2 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-3">
      <div className="absolute -top-5 left-1/2 z-30 -translate-x-1/2">
        <NetharionButton state={netharionState} onLongPress={() => setShowRealEvents(true)} />
      </div>

      <ReconnectButton />

      {/* Agent mode toggle — floating left, mirrors ReconnectButton on right */}
      <button
        type="button"
        onClick={handleAgentToggle}
        className={`absolute left-2 top-2 z-30 flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-all active:scale-95 ${
          agentActive
            ? "border-neon-blue/40 bg-neon-blue/20 text-neon-blue shadow-neon-blue/20"
            : "border-white/10 bg-black/20 text-muted-foreground hover:text-foreground"
        }`}
        aria-label={agentActive ? "Disattiva agente esterno" : "Attiva agente esterno"}
      >
        <Bot size={18} />
      </button>

      <NetharionRealEventsSheet open={showRealEvents} onClose={() => setShowRealEvents(false)} />

      <div className="grid grid-cols-5 gap-1 px-12 pt-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <RouterNavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[8px] transition-all ${
                isActive
                  ? "bg-white/5 text-neon-purple scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? "neon-text-subtle" : ""} />
                <span className="max-w-full truncate leading-none">
                  {label}
                </span>
              </>
            )}
          </RouterNavLink>
        ))}

        {/* Spotify quick-launch button */}
        <button
          type="button"
          onClick={handleSpotifyPress}
          className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[8px] text-muted-foreground transition-all hover:text-green-400 active:scale-95"
          aria-label="Apri Spotify"
        >
          <SpotifyIcon size={18} />
          <span className="max-w-full truncate leading-none">Spotify</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;

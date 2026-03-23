import { useState } from "react";
import { NavLink as RouterNavLink } from "react-router-dom";
import { MessageCircle, Paperclip, FolderKanban, Settings, Bot, RefreshCw } from "lucide-react";
import NetharionButton from "@/components/common/NetharionButton";
import NetharionRealEventsSheet from "@/components/common/NetharionRealEventsSheet";
import SpotifyIcon from "@/components/common/SpotifyIcon";
import { useBackendConnection } from "@/context/BackendConnectionContext";
import { useNetharion } from "@/hooks/useNetharion";
import { getSelectedModel } from "@/lib/externalAgent";
import type { BackendLifecycleState } from "@/types";

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

  // External agent toggle state — persisted so Chat.tsx can read it
  const [agentActive, setAgentActive] = useState(() => {
    return localStorage.getItem("kael_agent_mode") === "1";
  });

  const toggleAgent = () => {
    const next = !agentActive;
    setAgentActive(next);
    localStorage.setItem("kael_agent_mode", next ? "1" : "0");
    // Dispatch event so Chat.tsx can react
    window.dispatchEvent(new CustomEvent("kael-agent-mode-changed", { detail: { active: next } }));
  };

  const selectedModel = getSelectedModel();

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

      {/* External Agent toggle button */}
      <button
        onClick={toggleAgent}
        className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[9px] transition-all active:scale-95 ${
          agentActive
            ? "text-teal-400 scale-105"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label={agentActive ? "Disconnetti agente" : "Connetti agente"}
      >
        <div className="relative">
          <Bot size={20} className={agentActive ? "text-teal-400" : ""} />
          {agentActive && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-teal-400 animate-pulse" />
          )}
        </div>
        <span className={agentActive ? "font-semibold text-teal-400" : "font-normal"}>
          {agentActive ? selectedModel.label : "Agent"}
        </span>
      </button>

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

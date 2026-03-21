import { NavLink as RouterNavLink } from "react-router-dom";
import { MessageCircle, Paperclip, Heart, FolderKanban, Settings, Bot } from "lucide-react";
import NetharionButton from "@/components/common/NetharionButton";
import SpotifyIcon from "@/components/common/SpotifyIcon";

const navItems = [
  { to: "/", icon: MessageCircle, label: "Chat" },
  { to: "/media", icon: Paperclip, label: "Allegati" },
  { to: "/external-agent", icon: Bot, label: "Agent" },
  { to: "/workspace", icon: FolderKanban, label: "Workspace" },
  { to: "/memories", icon: Heart, label: "Memories" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const BottomNav = () => {
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
        <NetharionButton />
      </div>
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
    </nav>
  );
};

export default BottomNav;

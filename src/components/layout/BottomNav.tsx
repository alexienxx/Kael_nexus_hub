import { NavLink as RouterNavLink } from "react-router-dom";
import { MessageCircle, Paperclip, Heart, FolderKanban, Settings } from "lucide-react";
import NetharionButton from "@/components/common/NetharionButton";

const navItems = [
  { to: "/", icon: MessageCircle, label: "Chat" },
  { to: "/media", icon: Paperclip, label: "Allegati" },
  { to: "/workspace", icon: FolderKanban, label: "Workspace" },
  { to: "/memories", icon: Heart, label: "Memories" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const BottomNav = () => {
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
    </nav>
  );
};

export default BottomNav;

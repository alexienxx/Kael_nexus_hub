import { NavLink as RouterNavLink } from "react-router-dom";
import { MessageCircle, Phone, ImageIcon, Heart, Settings } from "lucide-react";

const navItems = [
  { to: "/", icon: MessageCircle, label: "Chat" },
  { to: "/calls", icon: Phone, label: "Calls" },
  { to: "/media", icon: ImageIcon, label: "Media" },
  { to: "/memories", icon: Heart, label: "Memories" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const BottomNav = () => {
  return (
    <nav className="glass-strong relative z-20 flex items-center justify-around px-2 py-1.5 safe-bottom">
      {navItems.map(({ to, icon: Icon, label }) => (
        <RouterNavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] transition-all ${
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

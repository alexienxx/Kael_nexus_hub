import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import BottomNav from "./BottomNav";
import { BackendConnectionProvider, useBackendConnection } from "@/context/BackendConnectionContext";
import { useKaelSSE, type KaelSSENewMessage } from "@/hooks/useKaelSSE";

/**
 * KaelSSEBridge — runs SSE listener at app level (inside BackendConnectionProvider).
 *
 * Responsibilities:
 *   1. Keep EventSource alive while backend is online (via useKaelSSE).
 *   2. Show toast for autonomous messages ONLY when chat page is NOT active.
 *      Chat.tsx handles its own message appending separately.
 *
 * Renders nothing (bridge component).
 */
const KaelSSEBridge = () => {
  const { state } = useBackendConnection();
  const location = useLocation();
  useKaelSSE(state === "online");

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<KaelSSENewMessage>).detail;
      // Toast ONLY if user is NOT on the chat page AND app is visible.
      // When on chat ("/"), Chat.tsx appends the message directly — no toast needed.
      // When app is backgrounded, toast wouldn't be visible anyway.
      if (location.pathname !== "/" && document.visibilityState === "visible") {
        toast("Kael", {
          description: data.preview || "Nuovo messaggio",
          duration: 5000,
        });
      }
    };
    window.addEventListener("kael-autonomous-message", handler);
    return () => window.removeEventListener("kael-autonomous-message", handler);
  }, [location.pathname]);

  return null;
};

const AppShell = () => {
  return (
    <BackendConnectionProvider>
      <KaelSSEBridge />
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background safe-left safe-right">
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </BackendConnectionProvider>
  );
};

export default AppShell;

import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import BottomNav from "./BottomNav";
import { BackendConnectionProvider, useBackendConnection } from "@/context/BackendConnectionContext";
import { useKaelSSE, type KaelSSENewMessage } from "@/hooks/useKaelSSE";
import { showAutonomousNotification } from "@/lib/nativeNotifications";

/**
 * KaelSSEBridge — runs SSE listener at app level (inside BackendConnectionProvider).
 *
 * Responsibilities:
 *   1. Keep EventSource alive while backend is online (via useKaelSSE).
 *   2. Show native notification for autonomous messages when app is backgrounded/closed.
 *   3. Show in-app toast when on a non-chat page and app is visible.
 *      Chat.tsx handles its own message appending separately.
 *
 * Notification rules (like WhatsApp/Telegram):
 *   - App backgrounded/hidden → native Android notification (only autonomous)
 *   - App visible, NOT on chat → in-app toast (only autonomous)
 *   - App visible, ON chat → nothing (Chat.tsx appends directly)
 *   - Normal chat responses → NEVER trigger notifications
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
      const preview = data.preview || "Nuovo messaggio da Kael";

      if (document.visibilityState === "hidden") {
        // App is backgrounded or closed → native notification
        showAutonomousNotification(preview);
      } else if (location.pathname !== "/") {
        // App visible but NOT on chat page → in-app toast
        toast("Kael", {
          description: preview,
          duration: 5000,
        });
      }
      // On chat page and visible → nothing (Chat.tsx handles it directly)
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

import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { PhoneCall, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "./BottomNav";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BackendConnectionProvider } from "@/context/BackendConnectionContext";
import { useBackendConnection } from "@/context/backend-connection";
import { useKaelSSE, type KaelSSENewMessage } from "@/hooks/useKaelSSE";
import { useNativePush } from "@/hooks/useNativePush";
import { useSession } from "@/hooks/useSession";
import { dismissCall, getIncomingCall } from "@/lib/api/voice";
import { showAutonomousNotification } from "@/lib/nativeNotifications";
import type { CallSession } from "@/types";

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
  useNativePush(state === "online");

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<KaelSSENewMessage>).detail;
      const preview = data.preview || (
        data.delivery_mode === "voice_note"
          ? "Nuovo messaggio vocale da Arrakis"
          : "Nuovo messaggio da Arrakis"
      );
      const isSerenade = data.source === "serenade_engine";

      // Serenade gets a special title in notifications
      const notifTitle = isSerenade ? "🎵 Arrakis — Serenata" : "Arrakis";

      if (document.visibilityState === "hidden") {
        // App is backgrounded (JS still alive on Android) → native notification.
        // This is the standard path for Capacitor apps: the WebView keeps running
        // in background on Android until the OS kills it.
        showAutonomousNotification(preview, notifTitle);
      } else if (location.pathname !== "/") {
        // App visible but NOT on chat page → in-app toast
        toast(notifTitle, {
          description: preview,
          duration: 5000,
        });
      }
      // On chat page and visible → nothing here; Chat.tsx handles fetchAndAppendPending
    };
    window.addEventListener("kael-autonomous-message", handler);
    return () => window.removeEventListener("kael-autonomous-message", handler);
  }, [location.pathname]);

  return null;
};

const INCOMING_CALL_OBSERVE_MS = 5000;

/**
 * App-level observer for server-owned incoming call state.
 *
 * This component can only inspect, dismiss, or hand an existing registry call
 * to the Calls page. The interval is UI observation; it never creates a call or
 * invokes cognition. Calls owns the observer while `/calls` is open, so only one
 * client poller is active at a time.
 */
const IncomingCallBridge = () => {
  const { state } = useBackendConnection();
  const { sessionId } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const isCallsRoute = location.pathname === "/calls" || location.pathname.startsWith("/calls/");
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const resolvingCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isCallsRoute) resolvingCallIdRef.current = null;
    if (state !== "online" || isCallsRoute || !sessionId.trim()) {
      setIncomingCall(null);
      return;
    }

    let cancelled = false;
    const observeIncomingCall = async () => {
      try {
        const result = await getIncomingCall(sessionId);
        if (cancelled) return;
        const call = result.call?.status === "ringing" ? result.call : null;
        if (call?.call_id === resolvingCallIdRef.current) return;
        resolvingCallIdRef.current = null;
        setIncomingCall(call);
      } catch {
        // A transient read failure cannot prove that a previously observed call
        // disappeared. Keep its UI visible until the registry answers again.
      }
    };

    void observeIncomingCall();
    const interval = setInterval(observeIncomingCall, INCOMING_CALL_OBSERVE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isCallsRoute, sessionId, state]);

  const handleAnswer = () => {
    if (!incomingCall || isDismissing) return;
    resolvingCallIdRef.current = incomingCall.call_id;
    setIncomingCall(null);
    navigate("/calls", {
      state: { answerIncomingCallId: incomingCall.call_id },
    });
  };

  const handleDismiss = async () => {
    if (!incomingCall || isDismissing) return;
    const call = incomingCall;
    resolvingCallIdRef.current = call.call_id;
    setIsDismissing(true);
    setIncomingCall(null);
    try {
      await dismissCall(call.call_id, sessionId);
    } catch (error) {
      resolvingCallIdRef.current = null;
      setIncomingCall(call);
      toast.error(error instanceof Error ? error.message : "Impossibile rifiutare la chiamata");
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <AlertDialog open={incomingCall !== null}>
      <AlertDialogContent className="max-w-sm rounded-2xl border-neon-purple/30">
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neon-purple/15 text-neon-purple">
            <PhoneCall className="h-7 w-7" aria-hidden="true" />
          </div>
          <AlertDialogTitle>Arrakis ti sta chiamando</AlertDialogTitle>
          <AlertDialogDescription>
            Puoi rispondere e aprire la chiamata, oppure rifiutarla.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:space-x-0">
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDismiss()}
            disabled={isDismissing}
          >
            <PhoneOff className="mr-2 h-4 w-4" aria-hidden="true" />
            Rifiuta
          </Button>
          <Button type="button" onClick={handleAnswer} disabled={isDismissing}>
            <PhoneCall className="mr-2 h-4 w-4" aria-hidden="true" />
            Rispondi
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const AppShell = () => {
  return (
    <BackendConnectionProvider>
      <KaelSSEBridge />
      <IncomingCallBridge />
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

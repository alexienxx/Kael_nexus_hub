import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/store/theme";
import AppShell from "@/components/layout/AppShell";
import Chat from "@/pages/Chat";
import Calls from "@/pages/Calls";
import Media from "@/pages/Media";
import Workspace from "@/pages/Workspace";
import Settings from "@/pages/Settings";
import Observatory from "@/pages/Observatory";

import SpotifyCallback from "@/pages/SpotifyCallback";
import ServiceCallback from "@/pages/ServiceCallback";
import NotFound from "@/pages/NotFound";
import { useBootUpdateCheck } from "@/hooks/useBootUpdateCheck";
import UpdateDialog from "@/components/updates/UpdateDialog";
import { initNativeNotifications } from "@/lib/nativeNotifications";
import ClickInspector from "@/components/dev/ClickInspector";
import { useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import {
  emitForegroundChange,
  startHeartbeat,
  stopHeartbeat,
} from "@/lib/api/presence";
import { App as CapApp } from "@capacitor/app";

const queryClient = new QueryClient();

/** Inner component that uses hooks (must be inside providers) */
const AppRoutes = () => {
  const { result, showDialog, setShowDialog } = useBootUpdateCheck();
  const { sessionId } = useSession();

  // Initialize native notifications inside a React component so Capacitor
  // is fully ready (avoids race conditions at module-level execution).
  useEffect(() => {
    initNativeNotifications();
  }, []);

  // K-1.b — APK-side presence emit. Sends initial foreground=true +
  // starts a 30 s heartbeat; subscribes to Capacitor `appStateChange`
  // to flip foreground on/off as the user backgrounds/resumes the app.
  // Backend's K-1.c staleness fallback (>5 min silence -> degrade to
  // offline) is the safety net if heartbeat ever stops unexpectedly.
  useEffect(() => {
    if (!sessionId) return;
    let listenerHandle: { remove: () => void } | null = null;

    // Initial signal + start heartbeat (assume foreground on mount).
    emitForegroundChange(sessionId, true);

    CapApp.addListener("appStateChange", (state) => {
      emitForegroundChange(sessionId, state.isActive);
    })
      .then((h) => {
        listenerHandle = h;
      })
      .catch((err) => {
        // Non-Capacitor environment (e.g. browser dev) — listener N/A.
        console.warn("[K-1.b] CapApp.addListener unavailable:", err);
      });

    return () => {
      stopHeartbeat();
      if (listenerHandle) listenerHandle.remove();
    };
  }, [sessionId]);

  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Chat />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/media" element={<Media />} />
          <Route path="/workspace" element={<Workspace />} />
          
          <Route path="/settings" element={<Settings />} />
          <Route path="/observatory" element={<Observatory />} />
        </Route>
        <Route path="/spotify-callback" element={<SpotifyCallback />} />
        <Route path="/services/callback" element={<ServiceCallback />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* WiFi update dialog — shown automatically on boot if update is available */}
      <UpdateDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        manifest={result?.manifest ?? null}
      />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        {import.meta.env.DEV && <ClickInspector />}
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

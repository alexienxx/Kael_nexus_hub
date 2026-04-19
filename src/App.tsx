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

const queryClient = new QueryClient();

/** Inner component that uses hooks (must be inside providers) */
const AppRoutes = () => {
  const { result, showDialog, setShowDialog } = useBootUpdateCheck();

  // Initialize native notifications inside a React component so Capacitor
  // is fully ready (avoids race conditions at module-level execution).
  useEffect(() => {
    initNativeNotifications();
  }, []);

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

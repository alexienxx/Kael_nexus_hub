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
import Memories from "@/pages/Memories";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Chat />} />
              <Route path="/calls" element={<Calls />} />
              <Route path="/media" element={<Media />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/memories" element={<Memories />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

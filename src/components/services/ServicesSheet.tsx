import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Github, Calendar, FileText, HardDrive, MessageSquare } from "lucide-react";
import GitHubServiceCard from "./GitHubServiceCard";
import ServiceCard from "./ServiceCard";
import RepoPickerSheet from "./RepoPickerSheet";
import { useServices } from "@/hooks/useServices";
import { useGitHubService } from "@/hooks/useGitHubService";
import { useAgenticActions } from "@/hooks/useAgenticActions";
import type { Service, GitHubRepo, GitHubActionMode } from "@/types";
import { toast } from "sonner";

/**
 * Services hub for managing agentic service integrations.
 *
 * IMPORTANT RULES:
 * - Connection status MUST come from backend via useServices hook
 * - DO NOT fake connected/service-ready state when backend is unavailable
 * - Fail gracefully if backend endpoints are not yet implemented
 * - DO NOT break chat functionality if services backend is unavailable
 */

interface ServicesSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const ServicesSheet = ({ isOpen, onClose }: ServicesSheetProps) => {
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const { services, isLoading: servicesLoading, error: servicesError, isBackendAvailable } = useServices();
  const { repos, selfRepos, fetchRepos, isLoading, error, isBackendAvailable: gitHubBackendAvailable } = useGitHubService();
  const { setGitHubContext } = useAgenticActions();

  // Find GitHub service from backend (if available)
  const githubService = services.find(s => s.provider === "github");

  // Future services that are not yet connected
  const futureServices: Service[] = [
    {
      id: "notion",
      provider: "notion",
      display_name: "Notion",
      icon: "📝",
      connection_status: "not_connected",
    },
    {
      id: "drive",
      provider: "drive",
      display_name: "Google Drive",
      icon: "📂",
      connection_status: "not_connected",
    },
    {
      id: "slack",
      provider: "slack",
      display_name: "Slack",
      icon: "💬",
      connection_status: "not_connected",
    },
    {
      id: "calendar",
      provider: "calendar",
      display_name: "Calendar",
      icon: "📅",
      connection_status: "not_connected",
    },
  ];

  const handleGitHubClick = () => {
    if (!gitHubBackendAvailable) {
      toast.error("GitHub services backend is not yet available");
      return;
    }
    if (!githubService || githubService.connection_status !== "connected") {
      toast.error("GitHub service is not connected");
      return;
    }
    setShowRepoPicker(true);
    if (repos.length === 0 && selfRepos.length === 0 && !isLoading) {
      fetchRepos();
    }
  };

  const handleRepoSelect = (repo: GitHubRepo, mode: GitHubActionMode) => {
    setGitHubContext(repo, mode);
    setShowRepoPicker(false);
    onClose();
    toast.success(`Context set: ${repo.full_name} - ${mode}`);
  };

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
    if (servicesError) {
      toast.error(servicesError);
    }
  }, [error, servicesError]);

  return (
    <>
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="glass-strong max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="neon-text text-neon-purple">Servizi</DrawerTitle>
            <DrawerDescription>Connessioni agentiche</DrawerDescription>
          </DrawerHeader>

          <ScrollArea className="flex-1 px-4 pb-4">
            <div className="space-y-6">
              {/* Warning if backend is unavailable */}
              {!isBackendAvailable && (
                <div className="glass p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
                  <p className="text-xs text-yellow-500">
                    ⚠️ Services backend is not yet available. Features are limited.
                  </p>
                </div>
              )}

              {/* Section A: Connected Services */}
              {githubService && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">
                    Collegati
                  </h3>
                  <div className="space-y-2">
                    <GitHubServiceCard service={githubService} onClick={handleGitHubClick} />
                  </div>
                </div>
              )}

              {/* Show message if no services are connected and backend is available */}
              {!githubService && isBackendAvailable && !servicesLoading && (
                <div className="glass p-4 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">No services connected yet</p>
                </div>
              )}

              {/* Section B: Quick Actions */}
              {githubService && githubService.connection_status === "connected" && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">
                    Azioni rapide
                  </h3>
                  <div className="glass p-3 rounded-lg space-y-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm hover:bg-neon-purple/10"
                      onClick={handleGitHubClick}
                    >
                      <Github size={16} className="mr-2" />
                      Open repo
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm hover:bg-neon-purple/10"
                      onClick={handleGitHubClick}
                    >
                      <FileText size={16} className="mr-2" />
                      Self-audit repo
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm hover:bg-neon-purple/10"
                      onClick={handleGitHubClick}
                    >
                      <FileText size={16} className="mr-2" />
                      Draft issue
                    </Button>
                  </div>
                </div>
              )}

              {/* Section C: Other Services */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">
                  Altri servizi
                </h3>
                <div className="space-y-2">
                  {futureServices.map((service) => (
                    <ServiceCard key={service.id} service={service} disabled />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center mt-3 px-4">
                  Coming later
                </p>
              </div>
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Repo Picker Sheet */}
      <RepoPickerSheet
        isOpen={showRepoPicker}
        onClose={() => setShowRepoPicker(false)}
        repos={repos}
        selfRepos={selfRepos}
        onSelectRepo={handleRepoSelect}
      />
    </>
  );
};

export default ServicesSheet;

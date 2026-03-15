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
import { useGitHubService } from "@/hooks/useGitHubService";
import { useAgenticActions } from "@/hooks/useAgenticActions";
import type { Service, GitHubRepo, GitHubActionMode } from "@/types";
import { toast } from "sonner";

interface ServicesSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const ServicesSheet = ({ isOpen, onClose }: ServicesSheetProps) => {
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const { repos, selfRepos, fetchRepos, isLoading, error } = useGitHubService();
  const { setGitHubContext } = useAgenticActions();

  // Mock GitHub service (in production, this would come from useServices hook)
  const githubService: Service = {
    id: "github",
    provider: "github",
    display_name: "GitHub",
    icon: "🐙",
    connection_status: "connected",
    account_label: "xxalexienxx",
    capabilities: ["Repo audit", "Self-repo", "Issue draft", "PR review"],
    scopes: ["repo", "read:org"],
  };

  // Mock future services
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
  }, [error]);

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
              {/* Section A: Connected Services */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-1">
                  Collegati
                </h3>
                <div className="space-y-2">
                  <GitHubServiceCard service={githubService} onClick={handleGitHubClick} />
                </div>
              </div>

              {/* Section B: Quick Actions */}
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

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GitHubRepo, GitHubActionMode } from "@/types";
import { getActionModeLabel } from "@/lib/api/githubAgentic";

interface RepoPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  repos: GitHubRepo[];
  selfRepos: GitHubRepo[];
  onSelectRepo: (repo: GitHubRepo, mode: GitHubActionMode) => void;
}

const actionModes: GitHubActionMode[] = [
  "repo_scan",
  "pr_review",
  "issue_review",
  "self_repo_scan",
  "self_repo_diagnostics_correlation",
  "issue_draft",
];

const RepoPickerSheet = ({
  isOpen,
  onClose,
  repos,
  selfRepos,
  onSelectRepo,
}: RepoPickerSheetProps) => {
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);

  const handleRepoClick = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
  };

  const handleModeSelect = (mode: GitHubActionMode) => {
    if (selectedRepo) {
      onSelectRepo(selectedRepo, mode);
      setSelectedRepo(null);
      onClose();
    }
  };

  const handleBack = () => {
    setSelectedRepo(null);
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="glass-strong max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="neon-text text-neon-purple">
            {selectedRepo ? selectedRepo.full_name : "Select Repository"}
          </DrawerTitle>
          <DrawerDescription>
            {selectedRepo
              ? "Choose an action mode for this repository"
              : "Choose a repository to work with"}
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-4 pb-4">
          {!selectedRepo ? (
            <div className="space-y-4">
              {/* Self Repos Section */}
              {selfRepos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
                    Kael Self-Repos
                  </h3>
                  <div className="space-y-2">
                    {selfRepos.map((repo) => (
                      <Card
                        key={repo.id}
                        className="glass p-3 cursor-pointer hover:scale-[1.01] transition-all hover:shadow-lg hover:shadow-neon-purple/20"
                        onClick={() => handleRepoClick(repo)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-foreground truncate">{repo.name}</h4>
                            <p className="text-xs text-muted-foreground truncate">{repo.owner}</p>
                          </div>
                          <Badge className="shrink-0 bg-neon-purple/20 text-neon-purple border-neon-purple/30">
                            Self-aware
                          </Badge>
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {repo.description}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Generic Repos Section */}
              {repos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">
                    Generic Repositories
                  </h3>
                  <div className="space-y-2">
                    {repos.map((repo) => (
                      <Card
                        key={repo.id}
                        className="glass p-3 cursor-pointer hover:scale-[1.01] transition-all hover:shadow-md"
                        onClick={() => handleRepoClick(repo)}
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-foreground truncate">{repo.name}</h4>
                          <p className="text-xs text-muted-foreground truncate">{repo.owner}</p>
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {repo.description}
                          </p>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {repos.length === 0 && selfRepos.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No repositories available</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleBack}
                className="text-sm text-neon-purple hover:underline mb-2"
              >
                ← Back to repos
              </button>

              <div className="glass p-3 rounded-lg mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-foreground">{selectedRepo.name}</h4>
                    <p className="text-xs text-muted-foreground">{selectedRepo.owner}</p>
                  </div>
                  {selectedRepo.is_self_repo && (
                    <Badge className="bg-neon-purple/20 text-neon-purple border-neon-purple/30">
                      Self-repo
                    </Badge>
                  )}
                </div>
              </div>

              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Action Modes</h3>
              <div className="grid grid-cols-1 gap-2">
                {actionModes.map((mode) => {
                  const isSelfRepoMode = mode.startsWith("self_repo");
                  const isDisabled = isSelfRepoMode && !selectedRepo.is_self_repo;

                  return (
                    <button
                      key={mode}
                      onClick={() => !isDisabled && handleModeSelect(mode)}
                      disabled={isDisabled}
                      className={`glass p-3 rounded-lg text-left transition-all ${
                        isDisabled
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:scale-[1.01] hover:shadow-lg hover:shadow-neon-purple/20 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {getActionModeLabel(mode)}
                        </span>
                        {isSelfRepoMode && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-neon-purple/10 border-neon-purple/50"
                          >
                            Self-repo only
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
};

export default RepoPickerSheet;

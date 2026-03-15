import { useState, useCallback } from "react";
import type { ServiceContextChip, GitHubRepo, GitHubActionMode } from "@/types";

/**
 * Hook for managing agentic action context in chat.
 * Handles service context chips that influence chat behavior.
 */
export function useAgenticActions() {
  const [activeContext, setActiveContext] = useState<ServiceContextChip | null>(null);

  const setGitHubContext = useCallback((repo: GitHubRepo, mode: GitHubActionMode) => {
    setActiveContext({
      provider: "github",
      target_label: repo.full_name,
      mode_label: mode,
      self_repo: repo.is_self_repo,
    });
  }, []);

  const clearContext = useCallback(() => {
    setActiveContext(null);
  }, []);

  const hasActiveContext = activeContext !== null;

  return {
    activeContext,
    hasActiveContext,
    setGitHubContext,
    clearContext,
  };
}

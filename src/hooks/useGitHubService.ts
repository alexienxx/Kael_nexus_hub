import { useState, useCallback } from "react";
import { useSession } from "./useSession";
import * as githubApi from "@/lib/api/githubAgentic";
import type { GitHubRepo, GitHubActionMode, AgenticServiceAction } from "@/types";

/**
 * Hook for managing GitHub service operations.
 * Handles repo fetching and agentic action execution.
 *
 * GRACEFUL DEGRADATION: If backend endpoints are not yet implemented,
 * returns empty repo lists and error state without breaking the UI.
 *
 * IMPORTANT: Self-repo classification MUST come from backend via is_self_repo field.
 * This hook does NOT perform any local repo reasoning.
 */
export function useGitHubService() {
  const { sessionId } = useSession();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selfRepos, setSelfRepos] = useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBackendAvailable, setIsBackendAvailable] = useState(true);

  const fetchRepos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await githubApi.getGitHubRepos(sessionId);
      setRepos(response.repos);
      setSelfRepos(response.self_repos);
      setIsBackendAvailable(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load GitHub repos";
      setError(errorMsg);
      setIsBackendAvailable(false);
      // Fail gracefully: set empty lists, don't throw
      setRepos([]);
      setSelfRepos([]);
      console.warn("GitHub services backend not available:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const getRepoDetails = useCallback(
    async (owner: string, repo: string) => {
      if (!isBackendAvailable) {
        throw new Error("GitHub services backend is not available");
      }
      try {
        return await githubApi.getGitHubRepoDetails(owner, repo, sessionId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to get repo details";
        console.error("Get repo details error:", err);
        throw new Error(errorMsg);
      }
    },
    [sessionId, isBackendAvailable]
  );

  const executeAction = useCallback(
    async (action: AgenticServiceAction) => {
      if (!isBackendAvailable) {
        throw new Error("GitHub services backend is not available");
      }
      try {
        return await githubApi.executeGitHubAction(action, sessionId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to execute GitHub action";
        console.error("Execute GitHub action error:", err);
        throw new Error(errorMsg);
      }
    },
    [sessionId, isBackendAvailable]
  );

  return {
    repos,
    selfRepos,
    isLoading,
    error,
    isBackendAvailable,
    fetchRepos,
    getRepoDetails,
    executeAction,
  };
}

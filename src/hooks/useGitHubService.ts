import { useState, useCallback } from "react";
import { useSession } from "./useSession";
import * as githubApi from "@/lib/api/githubAgentic";
import type { GitHubRepo, GitHubActionMode, AgenticServiceAction } from "@/types";

/**
 * Hook for managing GitHub service operations.
 * Handles repo fetching and agentic action execution.
 */
export function useGitHubService() {
  const { sessionId } = useSession();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selfRepos, setSelfRepos] = useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await githubApi.getGitHubRepos(sessionId);
      setRepos(response.repos);
      setSelfRepos(response.self_repos);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load GitHub repos";
      setError(errorMsg);
      console.error("Fetch GitHub repos error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const getRepoDetails = useCallback(
    async (owner: string, repo: string) => {
      try {
        return await githubApi.getGitHubRepoDetails(owner, repo, sessionId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to get repo details";
        console.error("Get repo details error:", err);
        throw new Error(errorMsg);
      }
    },
    [sessionId]
  );

  const executeAction = useCallback(
    async (action: AgenticServiceAction) => {
      try {
        return await githubApi.executeGitHubAction(action, sessionId);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to execute GitHub action";
        console.error("Execute GitHub action error:", err);
        throw new Error(errorMsg);
      }
    },
    [sessionId]
  );

  return {
    repos,
    selfRepos,
    isLoading,
    error,
    fetchRepos,
    getRepoDetails,
    executeAction,
  };
}

import { apiRequest } from "./client";
import type { GitHubRepo, GitHubActionMode, AgenticServiceAction } from "@/types";

/**
 * GITHUB AGENTIC API SERVICE LAYER
 *
 * Handles GitHub-specific agentic operations for repo-aware functionality.
 * This delegates actual reasoning and analysis to the backend.
 *
 * NOTE: These endpoints are assumed based on the Services hub requirements
 * and should align with the backend repo-awareness system being built.
 *
 * Expected endpoints:
 * - GET /services/github/repos - List accessible GitHub repos
 * - GET /services/github/repos/:owner/:repo - Get repo details
 * - POST /services/github/actions - Execute agentic GitHub action
 */

export interface GitHubReposResponse {
  repos: GitHubRepo[];
  self_repos: GitHubRepo[];
}

export interface GitHubRepoDetailResponse extends GitHubRepo {
  stars?: number;
  forks?: number;
  open_issues?: number;
  open_prs?: number;
  default_branch?: string;
  languages?: string[];
}

export interface GitHubActionResponse {
  action_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: {
    summary?: string;
    findings?: any[];
    recommendations?: string[];
    insights?: any;
  };
  error?: string;
}

/** Get list of accessible GitHub repos */
export async function getGitHubRepos(sessionId: string) {
  return apiRequest<GitHubReposResponse>(`/services/github/repos?session_id=${sessionId}`);
}

/** Get details of a specific GitHub repo */
export async function getGitHubRepoDetails(
  owner: string,
  repo: string,
  sessionId: string
) {
  return apiRequest<GitHubRepoDetailResponse>(
    `/services/github/repos/${owner}/${repo}?session_id=${sessionId}`
  );
}

/** Execute a GitHub agentic action */
export async function executeGitHubAction(
  action: AgenticServiceAction,
  sessionId: string
) {
  return apiRequest<GitHubActionResponse>("/services/github/actions", {
    method: "POST",
    body: JSON.stringify({ ...action, session_id: sessionId }),
  });
}

/** Get action mode display label */
export function getActionModeLabel(mode: GitHubActionMode): string {
  const labels: Record<GitHubActionMode, string> = {
    browse: "Browse",
    repo_scan: "Repo Scan",
    pr_review: "PR Review",
    issue_review: "Issue Review",
    self_repo_scan: "Self-Repo Scan",
    self_repo_diagnostics_correlation: "Diagnostics Correlation",
    issue_draft: "Issue Draft",
  };
  return labels[mode];
}

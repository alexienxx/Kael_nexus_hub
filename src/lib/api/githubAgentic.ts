import { apiRequest } from "./client";
import type { GitHubRepo, GitHubActionMode, AgenticServiceAction } from "@/types";

/**
 * GITHUB AGENTIC API SERVICE LAYER
 *
 * Handles GitHub-specific agentic operations for repo-aware functionality.
 * This delegates ALL reasoning and analysis to the backend.
 *
 * ⚠️ CRITICAL: These endpoints are NOT yet implemented in the backend.
 * This API layer is a contract definition that REQUIRES backend completion before use.
 * DO NOT treat /services/github/* endpoints as stable until backend is verified.
 *
 * Expected endpoints (PENDING BACKEND IMPLEMENTATION):
 * - GET /services/github/repos - List accessible GitHub repos with is_self_repo flag
 * - GET /services/github/repos/:owner/:repo - Get repo details with backend analysis
 * - POST /services/github/actions - Execute agentic GitHub action
 *
 * IMPORTANT RULES:
 * - The UI MUST NOT perform any local repo reasoning or self-repo classification
 * - Self-repo determination MUST come from backend via is_self_repo field
 * - All repo analysis MUST be delegated to backend
 * - UI is ONLY a selector/context layer
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
    findings?: unknown[];
    recommendations?: string[];
    insights?: unknown;
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

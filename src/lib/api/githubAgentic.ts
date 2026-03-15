import * as repoAwareness from "./repoAwareness";
import type { GitHubRepo, GitHubActionMode, AgenticServiceAction } from "@/types";

/**
 * GITHUB AGENTIC API SERVICE LAYER
 *
 * Handles GitHub-specific agentic operations for repo-aware functionality.
 * This delegates ALL reasoning and analysis to the backend.
 *
 * ✅ ALIGNED WITH BACKEND: This layer now uses the actual backend repo-awareness
 * endpoints under /agentic/repo/* instead of the non-existent /services/github/* endpoints.
 *
 * Backend endpoints:
 * - GET /agentic/repo/status - Get repo connection status and available repos
 * - POST /agentic/repo/analyze - Analyze a target repository
 * - POST /agentic/repo/self_audit - Self-repo diagnostics-correlated analysis
 * - POST /agentic/repo/draft_issue - Draft issue based on analysis
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

/**
 * Get list of accessible GitHub repos
 * Maps to: GET /agentic/repo/status
 */
export async function getGitHubRepos(sessionId: string) {
  const response = await repoAwareness.getRepoStatus(sessionId);

  // Convert RepoInfo to GitHubRepo format for compatibility
  const repos: GitHubRepo[] = response.repos.map(convertRepoInfoToGitHubRepo);
  const self_repos: GitHubRepo[] = response.self_repos.map(convertRepoInfoToGitHubRepo);

  return { repos, self_repos };
}

/**
 * Get details of a specific GitHub repo
 * Maps to: GET /agentic/repo/status (filtered by repo)
 */
export async function getGitHubRepoDetails(
  owner: string,
  repo: string,
  sessionId: string
) {
  const response = await repoAwareness.getRepoStatus(sessionId);
  const fullName = `${owner}/${repo}`;

  // Find the repo in the available repos
  const repoInfo = [...response.repos, ...response.self_repos].find(
    (r) => r.full_name === fullName
  );

  if (!repoInfo) {
    throw new Error(`Repository ${fullName} not found`);
  }

  return convertRepoInfoToGitHubRepoDetail(repoInfo);
}

/**
 * Execute a GitHub agentic action
 * Maps actions to appropriate /agentic/repo/* endpoints based on mode
 */
export async function executeGitHubAction(
  action: AgenticServiceAction,
  sessionId: string
) {
  const { mode, target, correlate_with_diagnostics, draft_issue } = action;

  // Map action modes to appropriate backend endpoints
  switch (mode) {
    case "self_repo_scan":
    case "self_repo_diagnostics_correlation": {
      // Self-repo modes use /agentic/repo/self_audit
      const response = await repoAwareness.performSelfAudit({
        session_id: sessionId,
        correlate_with_diagnostics: mode === "self_repo_diagnostics_correlation" || correlate_with_diagnostics,
      });

      return convertSelfAuditToActionResponse(response);
    }

    case "issue_draft": {
      // Issue draft mode uses /agentic/repo/draft_issue
      const response = await repoAwareness.draftIssue({
        session_id: sessionId,
        repo_target: target,
      });

      return convertDraftIssueToActionResponse(response);
    }

    case "browse":
    case "repo_scan":
    case "pr_review":
    case "issue_review":
    default: {
      // Generic repo analysis modes use /agentic/repo/analyze
      const response = await repoAwareness.analyzeRepo({
        session_id: sessionId,
        repo_target: target,
        mode,
      });

      return convertAnalyzeToActionResponse(response);
    }
  }
}

// Helper functions to convert between API formats

function convertRepoInfoToGitHubRepo(repoInfo: repoAwareness.RepoInfo): GitHubRepo {
  return {
    id: repoInfo.id,
    name: repoInfo.name,
    full_name: repoInfo.full_name,
    owner: repoInfo.owner,
    is_self_repo: repoInfo.is_self_repo,
    url: repoInfo.url,
    description: repoInfo.description,
  };
}

function convertRepoInfoToGitHubRepoDetail(repoInfo: repoAwareness.RepoInfo): GitHubRepoDetailResponse {
  return {
    id: repoInfo.id,
    name: repoInfo.name,
    full_name: repoInfo.full_name,
    owner: repoInfo.owner,
    is_self_repo: repoInfo.is_self_repo,
    url: repoInfo.url,
    description: repoInfo.description,
    stars: repoInfo.stars,
    forks: repoInfo.forks,
    open_issues: repoInfo.open_issues,
    open_prs: repoInfo.open_prs,
    default_branch: repoInfo.default_branch,
    languages: repoInfo.languages,
  };
}

function convertAnalyzeToActionResponse(response: repoAwareness.RepoAnalyzeResponse): GitHubActionResponse {
  return {
    action_id: response.analysis_id,
    status: response.status,
    result: response.result,
    error: response.error,
  };
}

function convertSelfAuditToActionResponse(response: repoAwareness.SelfAuditResponse): GitHubActionResponse {
  return {
    action_id: response.audit_id,
    status: response.status,
    result: response.result,
    error: response.error,
  };
}

function convertDraftIssueToActionResponse(response: repoAwareness.DraftIssueResponse): GitHubActionResponse {
  return {
    action_id: response.draft_id,
    status: response.status,
    result: response.draft ? {
      summary: response.draft.title,
      findings: [response.draft],
      recommendations: response.draft.labels,
      insights: { body: response.draft.body },
    } : undefined,
    error: response.error,
  };
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

import { apiRequest } from "./client";
import type { GitHubActionMode } from "@/types";

/**
 * REPO-AWARENESS API SERVICE LAYER
 *
 * This API layer aligns with the actual backend repo-awareness contract.
 * Backend exposes /agentic/repo/* endpoints for repo-aware operations.
 *
 * Endpoints:
 * - GET /agentic/repo/status - Get repo connection/availability status
 * - POST /agentic/repo/analyze - Analyze a target repository
 * - POST /agentic/repo/self_audit - Self-repo diagnostics-correlated analysis
 * - POST /agentic/repo/draft_issue - Draft issue based on analysis
 *
 * IMPORTANT RULES:
 * - The UI MUST NOT perform any local repo reasoning or self-repo classification
 * - All repo analysis MUST be delegated to backend
 * - UI is ONLY a selector/context layer
 * - MUST fail gracefully when backend endpoints are unavailable
 */

/**
 * Repo status response - backend provides available repos and self-repo classification
 */
export interface RepoStatusResponse {
  available: boolean;
  repos: RepoInfo[];
  self_repos: RepoInfo[];
}

/**
 * Repository information provided by backend
 * CRITICAL: is_self_repo MUST be determined by backend, NOT by frontend
 */
export interface RepoInfo {
  id: string;
  name: string;
  full_name: string;
  owner: string;
  is_self_repo: boolean;
  url: string;
  description?: string;
  stars?: number;
  forks?: number;
  open_issues?: number;
  open_prs?: number;
  default_branch?: string;
  languages?: string[];
}

/**
 * Request to analyze a repository
 */
export interface RepoAnalyzeRequest {
  session_id: string;
  repo_target: string; // e.g., "owner/repo"
  mode: GitHubActionMode;
  context?: string;
}

/**
 * Response from repo analysis
 */
export interface RepoAnalyzeResponse {
  analysis_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  repo: RepoInfo;
  result?: {
    summary?: string;
    findings?: unknown[];
    recommendations?: string[];
    insights?: unknown;
  };
  error?: string;
}

/**
 * Request for self-repo audit with diagnostics correlation
 */
export interface SelfAuditRequest {
  session_id: string;
  correlate_with_diagnostics?: boolean;
  context?: string;
}

/**
 * Response from self-audit
 */
export interface SelfAuditResponse {
  audit_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  repo: RepoInfo;
  result?: {
    summary?: string;
    diagnostics_correlation?: unknown;
    findings?: unknown[];
    recommendations?: string[];
    insights?: unknown;
  };
  error?: string;
}

/**
 * Request to draft an issue
 */
export interface DraftIssueRequest {
  session_id: string;
  repo_target?: string; // Optional: target repo for issue draft
  analysis_id?: string; // Optional: reference to previous analysis
  context?: string;
  title?: string;
  description?: string;
}

/**
 * Response from issue draft
 */
export interface DraftIssueResponse {
  draft_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  repo?: RepoInfo;
  draft?: {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  };
  error?: string;
}

/**
 * Get repo connection status and available repos
 * Maps to: GET /agentic/repo/status
 */
export async function getRepoStatus(sessionId: string) {
  return apiRequest<RepoStatusResponse>(`/agentic/repo/status?session_id=${sessionId}`);
}

/**
 * Analyze a target repository
 * Maps to: POST /agentic/repo/analyze
 */
export async function analyzeRepo(request: RepoAnalyzeRequest) {
  return apiRequest<RepoAnalyzeResponse>("/agentic/repo/analyze", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Perform self-repo audit with optional diagnostics correlation
 * Maps to: POST /agentic/repo/self_audit
 */
export async function performSelfAudit(request: SelfAuditRequest) {
  return apiRequest<SelfAuditResponse>("/agentic/repo/self_audit", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Draft an issue based on analysis or context
 * Maps to: POST /agentic/repo/draft_issue
 */
export async function draftIssue(request: DraftIssueRequest) {
  return apiRequest<DraftIssueResponse>("/agentic/repo/draft_issue", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

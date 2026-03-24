import { useState, useEffect, useCallback } from "react";
import {
  Github,
  GitBranch,
  Search,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGitHubService } from "@/hooks/useGitHubService";
import { useServices } from "@/hooks/useServices";
import { toast } from "sonner";
import type { GitHubRepo, GitHubActionMode } from "@/types";

/**
 * AGENTIC SETTINGS — "Funzioni Agentiche"
 *
 * Manages GitHub-connected agentic features:
 * - Repository listing from backend
 * - Repo analysis actions (browse, scan, self-audit, draft issue)
 * - Connection status and diagnostics
 *
 * ALL logic delegated to backend /agentic/repo/* endpoints.
 * UI is ONLY a selector/trigger layer.
 */

const ACTION_MODES: { mode: GitHubActionMode; label: string; desc: string; icon: typeof Search }[] = [
  { mode: "repo_scan", label: "Analizza Repo", desc: "Analisi strutturale completa", icon: Search },
  { mode: "self_repo_scan", label: "Self Audit", desc: "Audit con correlazione diagnostica", icon: FileText },
  { mode: "self_repo_diagnostics_correlation", label: "Diagnostica Correlata", desc: "Correla codice ↔ runtime", icon: AlertCircle },
  { mode: "issue_draft", label: "Draft Issue", desc: "Genera bozza issue automatica", icon: FileText },
  { mode: "pr_review", label: "Review PR", desc: "Analisi pull request aperte", icon: GitBranch },
  { mode: "issue_review", label: "Review Issues", desc: "Analisi issue aperte", icon: FileText },
];

const AgenticSettings = () => {
  const {
    repos,
    selfRepos,
    isLoading: reposLoading,
    error: reposError,
    isBackendAvailable,
    fetchRepos,
    executeAction,
  } = useGitHubService();

  const { services, isLoading: servicesLoading } = useServices();
  const gitHubService = services.find((s) => s.provider === "github");

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ mode: string; summary?: string; error?: string } | null>(null);

  // Fetch repos on mount
  useEffect(() => {
    if (isBackendAvailable) {
      fetchRepos();
    }
  }, [isBackendAvailable, fetchRepos]);

  const allRepos = [...selfRepos, ...repos.filter((r) => !selfRepos.some((s) => s.id === r.id))];

  const handleAction = useCallback(
    async (mode: GitHubActionMode) => {
      if (!selectedRepo) {
        toast.error("Seleziona un repository prima");
        return;
      }
      setExecuting(mode);
      setLastResult(null);
      try {
        const result = await executeAction({
          service_id: "github",
          action: mode,
          target: selectedRepo.full_name,
          mode,
          correlate_with_diagnostics: mode === "self_repo_diagnostics_correlation",
          draft_issue: mode === "issue_draft",
        });
        setLastResult({ mode, summary: result.result?.summary || "Azione completata" });
        toast.success(`${mode} completato`);
      } catch (err: any) {
        const msg = err?.message || "Errore durante l'azione";
        setLastResult({ mode, error: msg });
        toast.error(msg);
      } finally {
        setExecuting(null);
      }
    },
    [selectedRepo, executeAction]
  );

  // --- Backend unavailable state ---
  if (!isBackendAvailable && !servicesLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
          <AlertCircle size={28} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Backend non raggiungibile</p>
          <p className="text-xs text-muted-foreground mt-1">
            Le funzioni agentiche richiedono il backend Kael attivo
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRepos}>
          <RefreshCw size={14} className="mr-2" />
          Riprova
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="px-4 py-4 space-y-5">
        {/* Connection Status */}
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github size={18} className="text-neon-purple" />
              <span className="text-sm font-semibold text-foreground">GitHub</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  gitHubService?.connection_status === "connected"
                    ? "bg-green-500"
                    : isBackendAvailable
                    ? "bg-yellow-400 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span className="text-[10px] text-muted-foreground">
                {gitHubService?.connection_status === "connected"
                  ? "Connesso"
                  : isBackendAvailable
                  ? "Backend OK — servizio non collegato"
                  : "Offline"}
              </span>
            </div>
          </div>

          {/* Capabilities */}
          <div className="flex flex-wrap gap-1.5">
            {["repo_analysis", "self_audit", "diagnostics", "issue_drafting"].map((cap) => (
              <span
                key={cap}
                className="rounded-full px-2 py-0.5 text-[9px] font-medium bg-neon-purple/10 text-neon-purple"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* Repository Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Repository
            </h3>
            <button
              onClick={fetchRepos}
              disabled={reposLoading}
              className="text-[10px] text-neon-purple hover:underline disabled:opacity-50"
            >
              {reposLoading ? "Caricamento..." : "Aggiorna"}
            </button>
          </div>

          {reposError && (
            <div className="glass rounded-lg p-3 border border-yellow-500/30 bg-yellow-500/10">
              <p className="text-xs text-yellow-500">{reposError}</p>
            </div>
          )}

          {allRepos.length === 0 && !reposLoading && (
            <div className="glass rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Nessun repository disponibile
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Verifica che il backend abbia accesso a GitHub
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            {allRepos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => setSelectedRepo(repo)}
                className={`glass flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:scale-[1.005] active:scale-[0.995] ${
                  selectedRepo?.id === repo.id
                    ? "ring-1 ring-neon-purple/50 bg-neon-purple/5"
                    : ""
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-purple/10">
                  {repo.is_self_repo ? (
                    <GitBranch size={14} className="text-neon-purple" />
                  ) : (
                    <Github size={14} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{repo.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{repo.full_name}</p>
                </div>
                {repo.is_self_repo && (
                  <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold bg-neon-purple/15 text-neon-purple">
                    SELF
                  </span>
                )}
                {selectedRepo?.id === repo.id && (
                  <CheckCircle2 size={14} className="text-neon-purple shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Azioni Agentiche
          </h3>

          <div className="space-y-1.5">
            {ACTION_MODES.map(({ mode, label, desc, icon: Icon }) => {
              const isSelfOnly = mode.startsWith("self_repo_");
              const disabled =
                !selectedRepo ||
                executing !== null ||
                (isSelfOnly && !selectedRepo?.is_self_repo);

              return (
                <button
                  key={mode}
                  onClick={() => handleAction(mode)}
                  disabled={disabled}
                  className={`glass flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all hover:scale-[1.005] active:scale-[0.995] ${
                    disabled ? "opacity-40 cursor-not-allowed" : ""
                  } ${executing === mode ? "ring-1 ring-neon-purple/50" : ""}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neon-purple/10 text-neon-purple">
                    {executing === mode ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Icon size={16} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                    {isSelfOnly && (
                      <p className="text-[9px] text-neon-purple/60 mt-0.5">Solo self-repo</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div
            className={`glass rounded-xl p-4 border ${
              lastResult.error
                ? "border-red-500/30 bg-red-500/5"
                : "border-green-500/30 bg-green-500/5"
            }`}
          >
            <div className="flex items-start gap-2">
              {lastResult.error ? (
                <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {lastResult.error ? "Errore" : "Risultato"}: {lastResult.mode}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap">
                  {lastResult.error || lastResult.summary}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info footer */}
        <div className="text-center space-y-1 pb-4">
          <p className="text-[9px] text-muted-foreground/50">
            Tutte le analisi sono delegate al backend /agentic/repo/*
          </p>
          <p className="text-[9px] text-muted-foreground/50">
            Self-repo: Kael_refactor_ultimate, kael-nexus-hub, kael-desktop-ai-assi
          </p>
        </div>
      </div>
    </ScrollArea>
  );
};

export default AgenticSettings;

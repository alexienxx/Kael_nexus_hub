/**
 * Section 11: Audit Trails — Web Search / Advisor / Netharion Probe
 *
 * Three SEPARATE sub-tabs, never mixed in a single list.
 * Each sub-tab shows the last 100 entries from its respective JSONL log.
 */

import { useState } from "react";
import { useWebAudit, useAdvisorAudit, useProbeAudit } from "@/hooks/useObservatory";
import { MetaBar, SectionLoading, SectionError, SectionPending } from "./shared";
import { Globe, Bot, Radar, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import type { WebAuditEntry, AdvisorAuditEntry, ProbeAuditEntry } from "@/lib/api/observatory";

// ─── Sub-tab definitions ───

const SUB_TABS = [
  { id: "web" as const, label: "Web Search", icon: Globe },
  { id: "advisor" as const, label: "Advisor", icon: Bot },
  { id: "probe" as const, label: "Probe", icon: Radar },
];

type SubTabId = typeof SUB_TABS[number]["id"];

// ─── Helpers ───

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function BoolBadge({ value, trueLabel, falseLabel }: { value: boolean; trueLabel: string; falseLabel: string }) {
  return value ? (
    <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[10px]">
      <CheckCircle size={10} /> {trueLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-zinc-500 text-[10px]">
      <XCircle size={10} /> {falseLabel}
    </span>
  );
}

// ─── Web Search Sub-tab ───

function WebTab() {
  const { state, data, error, retry } = useWebAudit();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Nessun dato web audit disponibile" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const entries = data.data as WebAuditEntry[];

  return (
    <div className="space-y-3">
      <MetaBar meta={data._meta} onRefresh={retry} />
      <div className="text-xs text-muted-foreground">{data.count} ricerche registrate</div>

      {entries.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">Nessuna ricerca web registrata</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{e.query_text || "(vuoto)"}</span>
                <span className="text-muted-foreground shrink-0 ml-2">{formatTs(e.ts)}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5">{e.category}</span>
                <span>{e.provider || "—"}</span>
                <span>{e.results_count} risultati</span>
                <span className="flex items-center gap-0.5"><Clock size={10} /> {e.ms}ms</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <BoolBadge value={e.used_in_generation} trueLabel="Usato" falseLabel="Non usato" />
                <BoolBadge value={e.persisted_to_memory} trueLabel="In memoria" falseLabel="Non salvato" />
                <BoolBadge value={e.learned} trueLabel="Appreso" falseLabel="Non appreso" />
              </div>
              {e.error && (
                <div className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle size={10} /> {e.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Advisor Sub-tab ───

function AdvisorTab() {
  const { state, data, error, retry } = useAdvisorAudit();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Nessun dato advisor audit disponibile" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const entries = data.data as AdvisorAuditEntry[];

  const VERDICT_STYLES: Record<string, string> = {
    pass: "bg-emerald-500/20 text-emerald-400",
    revise: "bg-amber-500/20 text-amber-400",
    reject: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-3">
      <MetaBar meta={data._meta} onRefresh={retry} />
      <div className="text-xs text-muted-foreground">{data.count} consultazioni registrate</div>

      {entries.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">Nessuna consultazione advisor registrata</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground truncate max-w-[70%]">{e.query_summary || "(nessun sommario)"}</span>
                <span className="text-muted-foreground shrink-0 ml-2">{formatTs(e.ts)}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                <span className={`rounded px-1.5 py-0.5 ${VERDICT_STYLES[e.verdict] ?? "bg-zinc-500/20 text-zinc-400"}`}>
                  {e.verdict}
                </span>
                <span>score: {e.score.toFixed(2)}</span>
                <span>{e.model}</span>
                <span className="flex items-center gap-0.5"><Clock size={10} /> {e.latency_ms.toFixed(0)}ms</span>
                {e.budget_remaining != null && (
                  <span>budget: {e.budget_remaining} rimanenti</span>
                )}
              </div>
              {e.flags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {e.flags.map((f, j) => (
                    <span key={j} className="bg-zinc-700/50 text-zinc-300 rounded px-1.5 py-0.5 text-[10px]">{f}</span>
                  ))}
                </div>
              )}
              {e.error && (
                <div className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle size={10} /> {e.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Probe Sub-tab ───

function ProbeTab() {
  const { state, data, error, retry } = useProbeAudit();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Nessun dato probe audit disponibile" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const entries = data.data as ProbeAuditEntry[];

  return (
    <div className="space-y-3">
      <MetaBar meta={data._meta} onRefresh={retry} />
      <div className="text-xs text-muted-foreground">{data.count} probe registrate</div>

      {entries.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">Nessuna probe Netharion registrata</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className={`rounded-lg border p-3 text-xs space-y-1.5 ${
              e.is_significant
                ? "border-purple-500/30 bg-purple-500/5"
                : "border-border bg-secondary/20"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{e.pair_id}</span>
                  {e.is_significant && (
                    <span className="bg-purple-500/20 text-purple-400 rounded px-1.5 py-0.5 text-[10px] font-medium">
                      SIGNIFICANT
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 ml-2">{formatTs(e.ts)}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                <span>{e.model}</span>
                <span>delta: {e.delta_composite.toFixed(4)}</span>
                <span>confidence: {(e.confidence * 100).toFixed(1)}%</span>
                <span>resonance: {e.resonance_score.toFixed(3)}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-muted-foreground">
                <span>emb Δ{e.delta_embedding.toFixed(4)}</span>
                <span>logp Δ{e.delta_logprob.toFixed(4)}</span>
                <span>struct Δ{e.delta_structural.toFixed(4)}</span>
              </div>
              <div className="flex gap-3 text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Clock size={10} /> trigger {e.latency_ms_trigger.toFixed(0)}ms
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock size={10} /> control {e.latency_ms_control.toFixed(0)}ms
                </span>
                <span>{e.tokens_trigger + e.tokens_control} tokens</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main AuditSection with 3 sub-tabs ───

const SUB_TAB_COMPONENTS: Record<SubTabId, React.FC> = {
  web: WebTab,
  advisor: AdvisorTab,
  probe: ProbeTab,
};

export default function AuditSection() {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>("web");
  const ActiveContent = SUB_TAB_COMPONENTS[activeSubTab];

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSubTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all ${
              activeSubTab === id
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Active sub-tab content */}
      <ActiveContent />
    </div>
  );
}

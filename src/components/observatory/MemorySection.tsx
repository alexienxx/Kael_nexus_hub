/**
 * Section 6: Memory / Context / Persistence
 */

import { useMemoryState } from "@/hooks/useObservatory";
import { MetaBar, SubsystemStatusDot, SectionLoading, SectionError, SectionPending } from "./shared";
import { Progress } from "@/components/ui/progress";
import { Database, Clock, AlertTriangle, HardDrive, Layers } from "lucide-react";

export default function MemorySection() {
  const { state, data, error, retry } = useMemoryState();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Memory Pipeline non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  const satColor = d.saturation_pct > 80 ? "text-red-400" : d.saturation_pct > 60 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      {/* DB Status + Saturation */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database size={14} className="text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">DB Status</span>
          </div>
          <div className="flex items-center gap-2">
            <SubsystemStatusDot status={d.db_status} />
            <span className="text-sm font-semibold text-foreground capitalize">{d.db_status}</span>
          </div>
          {d.db_disk_usage_mb != null && (
            <p className="text-[9px] text-muted-foreground mt-1">{d.db_disk_usage_mb.toFixed(1)} MB</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={14} className="text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Pressione Memoria</span>
          </div>
          <p className={`text-lg font-bold font-mono ${satColor}`}>{d.saturation_pct.toFixed(0)}%</p>
          <Progress value={d.saturation_pct} className="h-1.5 mt-1" />
        </div>
      </div>

      {/* 3-metric breakdown */}
      {(d.db_fragmentation_pct != null || d.memory_pressure_score != null) && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <HardDrive size={12} /> Metriche DB
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {d.db_disk_usage_mb != null && (
              <div>
                <p className="text-muted-foreground text-[9px]">Disco</p>
                <p className="font-mono font-semibold">{d.db_disk_usage_mb.toFixed(1)} MB</p>
              </div>
            )}
            {d.db_fragmentation_pct != null && (
              <div>
                <p className="text-muted-foreground text-[9px]">Frammentazione</p>
                <p className={`font-mono font-semibold ${d.db_fragmentation_pct > 20 ? "text-amber-400" : ""}`}>{d.db_fragmentation_pct.toFixed(0)}%</p>
              </div>
            )}
            {d.memory_pressure_score != null && (
              <div>
                <p className="text-muted-foreground text-[9px]">Pressione</p>
                <p className={`font-mono font-semibold ${d.memory_pressure_score > 0.8 ? "text-red-400" : d.memory_pressure_score > 0.6 ? "text-amber-400" : ""}`}>{(d.memory_pressure_score * 100).toFixed(0)}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-3">
        <TimestampCard label="Ultimo retrieval" ts={d.last_retrieval_ts} />
        <TimestampCard label="Ultimo persist" ts={d.last_persist_ts} />
      </div>

      {/* Counts */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
          <Layers size={12} /> Conteggi Memoria
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MemCount label="Breve termine" value={d.short_term_count} />
          <MemCount label="Lungo termine" value={d.long_term_count} />
          <MemCount label="Semantica" value={d.semantic_memory_count} />
          <MemCount label="Relazionale" value={d.relationship_timeline_count} />
          <MemCount label="Simbolica" value={d.symbolic_memory_count} unavailable={d.symbolic_memory_available === false} />
          <MemCount label="Backlog" value={d.backlog_count} warn={(d.backlog_count ?? 0) > 10} unavailable={d.backlog_available === false} />
        </div>
      </div>

      {/* Distillation status */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Distillation</p>
        <p className="text-sm font-semibold text-foreground">{d.distillation_status ?? "Non disponibile"}</p>
        {d.distillation_available === false && <p className="text-[9px] text-muted-foreground">Non implementata</p>}
      </div>

      {/* Failed retrievals */}
      {d.failed_retrievals != null && d.failed_retrievals > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-xs text-amber-300">Retrieval falliti: <strong>{d.failed_retrievals}</strong></span>
        </div>
      )}

      {/* Memories used last turn */}
      {d.memories_used_last_turn.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Memorie usate (ultimo turno)</h3>
          <div className="flex flex-wrap gap-1">
            {d.memories_used_last_turn.map((m) => (
              <span key={m} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-foreground/70">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Dominant categories */}
      {Object.keys(d.dominant_categories).length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Categorie dominanti</h3>
          <div className="space-y-1.5">
            {Object.entries(d.dominant_categories)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="text-foreground/80">{cat}</span>
                  <span className="font-mono text-muted-foreground">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimestampCard({ label, ts }: { label: string; ts: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Clock size={12} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xs font-mono text-foreground">
        {ts ? new Date(ts * 1000).toLocaleTimeString("it-IT") : "—"}
      </p>
    </div>
  );
}

function MemCount({ label, value, warn, unavailable }: { label: string; value: number | null; warn?: boolean; unavailable?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-foreground/70">{label}</span>
      {unavailable ? (
        <span className="font-mono text-muted-foreground/50">N/D</span>
      ) : (
        <span className={`font-mono font-semibold ${warn ? "text-amber-400" : "text-foreground"}`}>{value ?? 0}</span>
      )}
    </div>
  );
}

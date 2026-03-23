/**
 * Section 8: Module Health / Wired vs Decorative
 */

import { useModuleHealth } from "@/hooks/useObservatory";
import { MetaBar, SubsystemStatusDot, SectionLoading, SectionError, SectionPending } from "./shared";
import { Package, Check, X, AlertTriangle, Paintbrush } from "lucide-react";

const STATUS_ORDER: Record<string, number> = {
  online: 0, partial: 1, stale: 2, decorative: 3, not_loaded: 4, offline: 5, broken: 6,
};

export default function ModulesSection() {
  const { state, data, error, retry } = useModuleHealth();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Module Health non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  const sorted = [...d.modules].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="Wired" value={d.total_wired} icon={<Check size={14} />} color="text-emerald-400" />
        <SummaryCard label="Decorativi" value={d.total_decorative} icon={<Paintbrush size={14} />} color="text-purple-400" />
        <SummaryCard label="Broken" value={d.total_broken} icon={<X size={14} />} color="text-red-400" />
      </div>

      {/* Module list */}
      <div className="space-y-1.5">
        {sorted.map((m) => (
          <div
            key={m.name}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              m.status === "offline" || !m.wired ? "border-red-500/20 bg-red-500/5" :
              m.decorative ? "border-purple-500/20 bg-purple-500/5" :
              m.status === "partial" || m.status === "stale" ? "border-amber-500/20 bg-amber-500/5" :
              "border-border bg-secondary/20"
            }`}
          >
            <SubsystemStatusDot status={m.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{m.name}</span>
                {m.decorative && (
                  <span className="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-medium text-purple-400">decorativo</span>
                )}
                {!m.wired && !m.decorative && (
                  <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-medium text-red-400">non wired</span>
                )}
              </div>
              {m.error && <p className="text-[10px] text-red-400 mt-0.5">{m.error}</p>}
              {m.last_active_ts && (
                <p className="text-[9px] text-muted-foreground">
                  Ultimo: {new Date(m.last_active_ts * 1000).toLocaleTimeString("it-IT")}
                </p>
              )}
            </div>
            <ModuleIcon wired={m.wired} decorative={m.decorative} status={m.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
      <div className={`flex items-center justify-center gap-1 ${color} mb-1`}>{icon}</div>
      <p className="text-lg font-bold font-mono text-foreground">{value}</p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ModuleIcon({ wired, decorative, status }: { wired: boolean; decorative: boolean; status: string }) {
  if (wired && status === "online") return <Check size={16} className="text-emerald-400" />;
  if (decorative) return <Paintbrush size={16} className="text-purple-400" />;
  if (status === "offline" || !wired) return <X size={16} className="text-red-400" />;
  return <AlertTriangle size={16} className="text-amber-400" />;
}

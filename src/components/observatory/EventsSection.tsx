/**
 * Section 9: Events / Trace / Recent Internal Shifts
 */

import { useRecentEvents } from "@/hooks/useObservatory";
import { MetaBar, SectionLoading, SectionError, SectionPending } from "./shared";
import { AlertTriangle, Info, Zap, Fingerprint, Brain, Heart, Package, Gauge } from "lucide-react";
import type { InternalEvent } from "@/lib/api/observatory";

const TYPE_CONFIG: Record<InternalEvent["type"], { icon: React.ReactNode; color: string; label: string }> = {
  drift: { icon: <Fingerprint size={12} />, color: "text-purple-400", label: "Drift" },
  emotional: { icon: <Heart size={12} />, color: "text-pink-400", label: "Emotivo" },
  autonomy: { icon: <Zap size={12} />, color: "text-amber-400", label: "Autonomy" },
  warning: { icon: <AlertTriangle size={12} />, color: "text-amber-400", label: "Warning" },
  failure: { icon: <AlertTriangle size={12} />, color: "text-red-400", label: "Errore" },
  persona_switch: { icon: <Brain size={12} />, color: "text-primary", label: "Persona" },
  module: { icon: <Package size={12} />, color: "text-blue-400", label: "Modulo" },
  weight_shift: { icon: <Gauge size={12} />, color: "text-teal-400", label: "Weight" },
};

const SEVERITY_BORDER: Record<InternalEvent["severity"], string> = {
  info: "border-border",
  warning: "border-amber-500/30",
  critical: "border-red-500/30",
};

const SEVERITY_BG: Record<InternalEvent["severity"], string> = {
  info: "bg-secondary/20",
  warning: "bg-amber-500/5",
  critical: "bg-red-500/5",
};

export default function EventsSection() {
  const { state, data, error, retry } = useRecentEvents();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Event Tape non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      <div className="text-xs text-muted-foreground">
        {d.total_count} eventi totali · Mostrando {d.events.length} recenti
      </div>

      {/* Event tape */}
      <div className="space-y-2">
        {d.events.map((e) => {
          const cfg = TYPE_CONFIG[e.type] ?? TYPE_CONFIG.warning;
          return (
            <div key={e.id} className={`rounded-lg border ${SEVERITY_BORDER[e.severity]} ${SEVERITY_BG[e.severity]} p-3`}>
              <div className="flex items-start gap-2">
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase ${cfg.color}`}>{cfg.label}</span>
                    {e.severity === "critical" && (
                      <span className="rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-bold text-red-400">CRITICO</span>
                    )}
                    <span className="text-[9px] text-muted-foreground ml-auto">
                      {new Date(e.ts * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 mt-1">{e.summary}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {d.events.length === 0 && (
        <div className="text-center py-8">
          <Info size={20} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nessun evento recente</p>
        </div>
      )}
    </div>
  );
}

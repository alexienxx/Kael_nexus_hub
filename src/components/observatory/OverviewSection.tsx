/**
 * Section 1: Overview / Core Status
 */

import { useOverview } from "@/hooks/useObservatory";
import { MetaBar, SubsystemStatusDot, WarningBanner, SectionLoading, SectionError, SectionPending } from "./shared";
import { Activity, Zap, Brain, Clock } from "lucide-react";

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function OverviewSection() {
  const { state, data, error, retry } = useOverview();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Overview non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />
      <WarningBanner warnings={d.warnings} />

      {/* Primary stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Brain size={16} />} label="Modello" value={d.model_active} />
        <StatCard icon={<Zap size={16} />} label="Provider" value={d.provider_active} />
        <StatCard icon={<Activity size={16} />} label="Heartbeat" value={d.heartbeat_status} />
        <StatCard icon={<Clock size={16} />} label="Uptime" value={formatUptime(d.uptime_seconds)} />
      </div>

      {/* Persona / Manifest */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">Identità Attiva</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-primary">{d.persona_active ?? "—"}</span>
          {d.manifest_active && <span className="text-muted-foreground">/ {d.manifest_active}</span>}
        </div>
      </div>

      {/* Autonomy + Last activity */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Zap size={16} />} label="Autonomy" value={d.autonomy_status} />
        <StatCard icon={<Activity size={16} />} label="Turn" value={d.last_turn_id?.toString() ?? "—"} subtitle={d.last_turn_ts ? new Date(d.last_turn_ts * 1000).toLocaleTimeString("it-IT") : undefined} />
      </div>

      {/* Subsystems grid */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-3">Sottosistemi</h3>
        <div className="grid grid-cols-2 gap-2">
          {d.subsystems.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-xs">
              <SubsystemStatusDot status={s.status} />
              <span className="text-foreground/80">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

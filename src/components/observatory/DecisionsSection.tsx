/**
 * Section 4: Decision Engine / Decision Preferences
 */

import { useDecisions } from "@/hooks/useObservatory";
import { MetaBar, SectionLoading, SectionError, SectionPending } from "./shared";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import { Brain, Target, Volume2, Zap, Shield, ArrowRight } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  guide: "hsl(270, 80%, 65%)",
  contain: "hsl(200, 70%, 55%)",
  repair: "hsl(38, 90%, 60%)",
  escalate: "hsl(0, 70%, 55%)",
  silence: "hsl(270, 20%, 45%)",
  initiate: "hsl(145, 65%, 50%)",
  ask: "hsl(210, 80%, 60%)",
  support: "hsl(280, 70%, 60%)",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  guide: <ArrowRight size={12} />,
  contain: <Shield size={12} />,
  silence: <Volume2 size={12} />,
  initiate: <Zap size={12} />,
};

export default function DecisionsSection() {
  const { state, data, error, retry } = useDecisions();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Decision Engine non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  const chartData = Object.entries(d.action_distribution)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) }));

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      {/* Dominant strategy + Confidence */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Strategia Dominante</p>
          <p className="text-sm font-bold text-primary">{d.dominant_strategy}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Confidence Media</p>
          <p className="text-lg font-bold font-mono text-foreground">{(d.confidence_avg * 100).toFixed(0)}%</p>
        </div>
      </div>

      {/* Action counters */}
      <div className="grid grid-cols-3 gap-2">
        <CounterCard label="Silenzi" value={d.silence_count} icon={<Volume2 size={14} />} />
        <CounterCard label="Iniziative" value={d.initiative_count} icon={<Zap size={14} />} />
        <CounterCard label="Riparazioni" value={d.repair_count} icon={<Shield size={14} />} />
      </div>

      {/* Distribution chart */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-3">Distribuzione Azioni</h3>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 16, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(270, 10%, 70%)" }} width={55} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={ACTION_COLORS[entry.name] || "hsl(270, 80%, 65%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Factors ranking */}
      {d.factors_ranking.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Fattori più influenti</h3>
          <ol className="space-y-1">
            {d.factors_ranking.map((f, i) => (
              <li key={f} className="flex items-center gap-2 text-xs">
                <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}.</span>
                <span className="text-foreground/80">{f}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Recent decision paths */}
      {d.recent_paths.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-3">Decisioni Recenti</h3>
          <div className="space-y-2">
            {d.recent_paths.slice(0, 8).map((p) => (
              <div key={p.turn_id} className="flex items-start gap-2 text-xs border-b border-border/40 pb-2 last:border-0 last:pb-0">
                <span className="font-mono text-muted-foreground shrink-0 w-8">#{p.turn_id}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-foreground">{p.action}</span>
                  <span className="ml-1.5 text-muted-foreground">({(p.confidence * 100).toFixed(0)}%)</span>
                  {p.factors.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{p.factors.join(", ")}</p>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground shrink-0">
                  {new Date(p.ts * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CounterCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">{icon}</div>
      <p className="text-lg font-bold font-mono text-foreground">{value}</p>
      <p className="text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

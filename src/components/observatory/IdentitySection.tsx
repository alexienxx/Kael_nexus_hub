/**
 * Section 3: Personality / Identity Drift
 */

import { useIdentityDrift } from "@/hooks/useObservatory";
import { MetaBar, TrendArrow, Sparkline, SectionLoading, SectionError, SectionPending } from "./shared";
import { Progress } from "@/components/ui/progress";
import { Fingerprint, TrendingUp, TrendingDown, Sparkles, AlertTriangle } from "lucide-react";

export default function IdentitySection() {
  const { state, data, error, retry } = useIdentityDrift();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Identity Drift non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  const driftColor = d.drift_score > 0.7 ? "text-red-400" : d.drift_score > 0.4 ? "text-amber-400" : "text-emerald-400";
  const coherenceColor = d.coherence_score > 0.7 ? "text-emerald-400" : d.coherence_score > 0.4 ? "text-amber-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      {/* Drift + Coherence scores */}
      <div className="grid grid-cols-2 gap-3">
        <ScoreCard label="Drift Score" value={d.drift_score} color={driftColor} icon={<Fingerprint size={16} />} />
        <ScoreCard label="Coherence" value={d.coherence_score} color={coherenceColor} icon={<Sparkles size={16} />} />
      </div>

      {/* Stance + Initiative */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Stance</p>
          <p className="text-sm font-semibold text-foreground">{d.stance}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Stile Iniziativa</p>
          <p className="text-sm font-semibold text-foreground">{d.initiative_style}</p>
        </div>
      </div>

      {/* Traits */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <h3 className="text-xs font-semibold text-muted-foreground mb-3">Tratti Personalità</h3>
        <div className="space-y-3">
          {d.traits.map((t) => (
            <div key={t.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-foreground">{t.name}</span>
                  <TrendArrow trend={t.trend} />
                </div>
                <span className="text-xs font-mono text-foreground">
                  {t.current.toFixed(2)}
                  <span className={`ml-1 text-[9px] ${t.delta > 0 ? "text-amber-400" : t.delta < 0 ? "text-blue-400" : "text-muted-foreground"}`}>
                    {t.delta > 0 ? "+" : ""}{t.delta.toFixed(3)}
                  </span>
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                {/* Baseline marker */}
                <div className="absolute top-0 h-full w-0.5 bg-muted-foreground/40" style={{ left: `${t.baseline * 100}%` }} />
                <div className={`absolute top-0 h-full rounded-full transition-all ${
                  Math.abs(t.delta) > 0.1 ? "bg-amber-400" : "bg-primary"
                }`} style={{ width: `${t.current * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Emerging / Declining */}
      <div className="grid grid-cols-2 gap-3">
        {d.emerging_traits.length > 0 && (
          <TagList label="Emergenti" items={d.emerging_traits} icon={<TrendingUp size={12} />} color="text-emerald-400" />
        )}
        {d.declining_traits.length > 0 && (
          <TagList label="In declino" items={d.declining_traits} icon={<TrendingDown size={12} />} color="text-red-400" />
        )}
      </div>

      {/* Themes + Motifs */}
      {d.dominant_themes.length > 0 && (
        <TagList label="Temi dominanti" items={d.dominant_themes} icon={<Sparkles size={12} />} color="text-primary" />
      )}
      {d.symbolic_motifs.length > 0 && (
        <TagList label="Motivi simbolici" items={d.symbolic_motifs} icon={<Fingerprint size={12} />} color="text-neon-pink" />
      )}

      {/* Tensions */}
      {d.persona_tensions.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={12} className="text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">Tensioni tra personae</span>
          </div>
          {d.persona_tensions.map((t, i) => (
            <p key={i} className="text-xs text-amber-300/80">{t}</p>
          ))}
        </div>
      )}

      {/* Identity blocks usage */}
      {Object.keys(d.identity_blocks_usage).length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Blocchi identitari usati</h3>
          <div className="space-y-1.5">
            {Object.entries(d.identity_blocks_usage)
              .sort(([, a], [, b]) => b - a)
              .map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="text-foreground/80">{name}</span>
                  <span className="font-mono text-muted-foreground">{count}×</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${color}`}>{(value * 100).toFixed(0)}%</p>
    </div>
  );
}

function TagList({ label, items, icon, color }: { label: string; items: string[]; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className={`flex items-center gap-1.5 mb-2 ${color}`}>
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-foreground/70">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

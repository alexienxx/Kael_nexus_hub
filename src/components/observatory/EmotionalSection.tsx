/**
 * Section 5: Emotional / Arousal / Relational State
 */

import { useEmotionalState } from "@/hooks/useObservatory";
import { MetaBar, RiskBadge, TrendArrow, Sparkline, ValueBar, SectionLoading, SectionError, SectionPending } from "./shared";
import { Heart, Activity, MessageCircle } from "lucide-react";

const AXIS_SPARKLINE_COLOR: Record<string, string> = {
  healthy: "hsl(145, 65%, 50%)",
  attention: "hsl(38, 90%, 60%)",
  critical: "hsl(0, 70%, 55%)",
};

export default function EmotionalSection() {
  const { state, data, error, retry } = useEmotionalState();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Emotional Core non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      {/* Synthesis */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-primary mb-1">
          <Heart size={14} />
          <span className="text-xs font-semibold">Stato Emotivo</span>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">{d.synthesis}</p>
      </div>

      {/* Last nudge */}
      {d.last_nudge_ts && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-secondary/20 p-2">
          <MessageCircle size={12} />
          <span>Ultimo nudge: <strong className="text-foreground/80">{d.last_nudge_type}</strong></span>
          <span className="ml-auto text-[9px]">{new Date(d.last_nudge_ts * 1000).toLocaleTimeString("it-IT")}</span>
        </div>
      )}

      {/* Axes */}
      <div className="space-y-2">
        {d.axes.map((axis) => (
          <div
            key={axis.name}
            className={`rounded-lg border p-3 ${
              axis.risk === "critical" ? "border-red-500/40 bg-red-500/5" :
              axis.risk === "attention" ? "border-amber-500/30 bg-amber-500/5" :
              "border-border bg-secondary/20"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{axis.name}</span>
                <RiskBadge risk={axis.risk} />
                <TrendArrow trend={axis.trend} />
              </div>
              <span className="text-lg font-mono font-bold text-foreground">{axis.value.toFixed(2)}</span>
            </div>
            <ValueBar
              value={axis.value}
              min={axis.min}
              max={axis.max}
              thresholdLow={axis.healthy_range[0]}
              thresholdHigh={axis.healthy_range[1]}
              risk={axis.risk}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-muted-foreground font-mono">{axis.min.toFixed(1)} – {axis.max.toFixed(1)}</span>
              <Sparkline data={axis.sparkline} color={AXIS_SPARKLINE_COLOR[axis.risk]} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent events */}
      {d.recent_events.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Eventi recenti</h3>
          <div className="space-y-1">
            {d.recent_events.map((e, i) => (
              <p key={i} className="text-xs text-foreground/70">{e}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

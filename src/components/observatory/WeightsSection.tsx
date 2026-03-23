/**
 * Section 2: Weights / Dynamic Weight Health
 */

import { useWeights } from "@/hooks/useObservatory";
import { MetaBar, RiskBadge, TrendArrow, Sparkline, ValueBar, SectionLoading, SectionError, SectionPending, WarningBanner } from "./shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, TrendingUp, TrendingDown, Gauge } from "lucide-react";
import { useState } from "react";

const CATEGORY_ICONS: Record<string, string> = {
  emotional: "💜",
  relational: "🤝",
  cognitive: "🧠",
  identity: "🪞",
};

const RISK_SPARKLINE_COLOR: Record<string, string> = {
  healthy: "hsl(145, 65%, 50%)",
  attention: "hsl(38, 90%, 60%)",
  critical: "hsl(0, 70%, 55%)",
};

export default function WeightsSection() {
  const { state, data, error, retry } = useWeights();
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Weights Health non ancora wired" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  const categories = [...new Set(d.weights.map((w) => w.category))];
  const filtered = filterCategory ? d.weights.filter((w) => w.category === filterCategory) : d.weights;

  const riskWarnings: string[] = [];
  if (d.collapsing_weights.length) riskWarnings.push(`⚠️ Collapsing: ${d.collapsing_weights.join(", ")}`);
  if (d.saturated_weights.length) riskWarnings.push(`🔴 Saturated: ${d.saturated_weights.join(", ")}`);
  if (d.unstable_weights.length) riskWarnings.push(`⚡ Unstable: ${d.unstable_weights.join(", ")}`);

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />
      <WarningBanner warnings={riskWarnings} />

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        <SummaryPill label="Dominanti" count={d.dominant_weights.length} color="text-primary" />
        <SummaryPill label="Saturi" count={d.saturated_weights.length} color="text-red-400" />
        <SummaryPill label="Collasso" count={d.collapsing_weights.length} color="text-amber-400" />
        <SummaryPill label="Instabili" count={d.unstable_weights.length} color="text-amber-300" />
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <FilterChip label="Tutti" active={!filterCategory} onClick={() => setFilterCategory(null)} />
        {categories.map((c) => (
          <FilterChip key={c} label={`${CATEGORY_ICONS[c] || ""} ${c}`} active={filterCategory === c} onClick={() => setFilterCategory(c)} />
        ))}
      </div>

      {/* Missing weights */}
      {d.missing_weights.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          <span className="font-medium">Non in runtime:</span> {d.missing_weights.join(", ")}
        </div>
      )}

      {/* Weight cards */}
      <div className="space-y-2">
        {filtered.map((w) => (
          <WeightCard key={w.name} weight={w} />
        ))}
      </div>
    </div>
  );
}

function WeightCard({ weight: w }: { weight: import("@/lib/api/observatory").WeightEntry }) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${
      w.risk === "critical" ? "border-red-500/40 bg-red-500/5" :
      w.risk === "attention" ? "border-amber-500/30 bg-amber-500/5" :
      "border-border bg-secondary/20"
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{w.name}</span>
            <RiskBadge risk={w.risk} />
            <TrendArrow trend={w.trend} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{w.semantic_label}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-lg font-mono font-bold text-foreground">{w.value.toFixed(2)}</span>
          <span className="block text-[9px] text-muted-foreground">
            Δ {w.delta > 0 ? "+" : ""}{w.delta.toFixed(3)}
          </span>
        </div>
      </div>

      <ValueBar value={w.value} min={w.min} max={w.max} thresholdLow={w.threshold_low} thresholdHigh={w.threshold_high} risk={w.risk} />

      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] text-muted-foreground font-mono">{w.min.toFixed(1)} – {w.max.toFixed(1)}</span>
        <Sparkline data={w.sparkline} color={RISK_SPARKLINE_COLOR[w.risk]} />
      </div>

      {/* Impact tooltips */}
      <div className="flex gap-3 mt-2 text-[9px]">
        <Tooltip>
          <TooltipTrigger className="flex items-center gap-1 text-red-400/70 hover:text-red-400 cursor-help">
            <TrendingUp size={10} /> Se sale
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[200px]">{w.impact_high}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger className="flex items-center gap-1 text-blue-400/70 hover:text-blue-400 cursor-help">
            <TrendingDown size={10} /> Se scende
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[200px]">{w.impact_low}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function SummaryPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-secondary/30 px-2.5 py-1 text-[10px] font-medium ${color}`}>
      <Gauge size={10} />
      {label}: {count}
    </span>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-medium border transition-colors ${
        active ? "border-primary bg-primary/20 text-primary" : "border-border bg-secondary/20 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

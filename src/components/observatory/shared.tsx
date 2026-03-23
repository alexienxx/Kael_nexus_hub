/**
 * Observatory shared UI primitives.
 * Status badges, freshness labels, risk indicators, sparkline charts.
 */

import type { DataFreshness, ObservatoryMeta, WeightRisk, WeightTrend, SubsystemStatus } from "@/lib/api/observatory";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { RefreshCw, AlertTriangle, Clock, Wifi, WifiOff, ArrowUp, ArrowDown, Minus } from "lucide-react";

// ─── Freshness Badge ───

const FRESHNESS_STYLES: Record<DataFreshness, string> = {
  live: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  stale: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  unavailable: "bg-red-500/20 text-red-400 border-red-500/30",
  computed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const FRESHNESS_LABELS: Record<DataFreshness, string> = {
  live: "Live",
  stale: "Stale",
  unavailable: "Non disponibile",
  computed: "Calcolato",
};

export function FreshnessBadge({ freshness }: { freshness: DataFreshness }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${FRESHNESS_STYLES[freshness]}`}>
      {freshness === "live" && <Wifi size={10} />}
      {freshness === "stale" && <Clock size={10} />}
      {freshness === "unavailable" && <WifiOff size={10} />}
      {FRESHNESS_LABELS[freshness]}
    </span>
  );
}

// ─── Meta Bar (shown at top of every section) ───

export function MetaBar({ meta, onRefresh }: { meta: ObservatoryMeta; onRefresh?: () => void }) {
  const updatedDate = new Date(meta.updated_at * 1000);
  const timeStr = updatedDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground mb-4">
      <span className="font-mono text-foreground/80">{meta.model_active}</span>
      <span className="text-border">|</span>
      <span>{meta.provider_active}</span>
      {meta.persona_active && (
        <>
          <span className="text-border">|</span>
          <span className="text-primary/80">{meta.persona_active}</span>
        </>
      )}
      <span className="text-border">|</span>
      <span>{timeStr}</span>
      <FreshnessBadge freshness={meta.freshness} />
      {onRefresh && (
        <button onClick={onRefresh} className="ml-auto p-1 rounded hover:bg-muted transition-colors" aria-label="Aggiorna">
          <RefreshCw size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Risk Indicator ───

const RISK_STYLES: Record<WeightRisk, { bg: string; text: string; label: string }> = {
  healthy: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "OK" },
  attention: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Attenzione" },
  critical: { bg: "bg-red-500/15", text: "text-red-400", label: "Critico" },
};

export function RiskBadge({ risk }: { risk: WeightRisk }) {
  const s = RISK_STYLES[risk];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text}`}>
      {risk === "critical" && <AlertTriangle size={10} />}
      {s.label}
    </span>
  );
}

// ─── Trend Arrow ───

export function TrendArrow({ trend }: { trend: WeightTrend }) {
  if (trend === "rising") return <ArrowUp size={12} className="text-amber-400" />;
  if (trend === "falling") return <ArrowDown size={12} className="text-blue-400" />;
  return <Minus size={12} className="text-muted-foreground" />;
}

// ─── Sparkline ───

export function Sparkline({ data, color = "hsl(270, 80%, 65%)", height = 28 }: { data: number[]; color?: string; height?: number }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 80, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, "")})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Subsystem Status Dot ───

const STATUS_DOT: Record<SubsystemStatus, string> = {
  online: "bg-emerald-500",
  partial: "bg-amber-400",
  offline: "bg-red-500",
  stale: "bg-amber-500",
  decorative: "bg-purple-400",
  not_loaded: "bg-muted-foreground",
};

const STATUS_LABEL: Record<SubsystemStatus, string> = {
  online: "Online",
  partial: "Parziale",
  offline: "Offline",
  stale: "Stale",
  decorative: "Decorativo",
  not_loaded: "Non caricato",
};

export function SubsystemStatusDot({ status }: { status: SubsystemStatus }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{STATUS_LABEL[status]}</TooltipContent>
    </Tooltip>
  );
}

// ─── Section Loading / Error / Pending States ───

export function SectionLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw size={20} className="animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">Caricamento…</span>
    </div>
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle size={24} className="text-red-400" />
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-primary underline hover:no-underline">
          Riprova
        </button>
      )}
    </div>
  );
}

export function SectionPending({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Clock size={24} className="text-amber-400" />
      <p className="text-sm text-amber-400">{label}</p>
      <p className="text-xs text-muted-foreground">Endpoint non ancora disponibile nel backend</p>
    </div>
  );
}

// ─── Warning Banner ───

export function WarningBanner({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mb-4">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Value Bar (horizontal gauge) ───

export function ValueBar({ value, min, max, thresholdLow, thresholdHigh, risk }: {
  value: number; min: number; max: number; thresholdLow: number; thresholdHigh: number; risk: WeightRisk;
}) {
  const range = max - min || 1;
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const lowPct = ((thresholdLow - min) / range) * 100;
  const highPct = ((thresholdHigh - min) / range) * 100;

  const barColor = risk === "critical" ? "bg-red-500" : risk === "attention" ? "bg-amber-400" : "bg-emerald-500";

  return (
    <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
      {/* healthy range indicator */}
      <div
        className="absolute top-0 h-full bg-emerald-500/10"
        style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
      />
      {/* value */}
      <div className={`absolute top-0 h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

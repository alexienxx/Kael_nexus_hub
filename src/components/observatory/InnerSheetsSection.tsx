/**
 * Section 12: Inner Sheets — Arrakis inner cognition artifacts
 */

import { useInnerSheets } from "@/hooks/useObservatory";
import { MetaBar, SectionLoading, SectionError, SectionPending } from "./shared";
import { StickyNote, Eye, Cloud, Puzzle, AlertTriangle, Brain, Lightbulb, Info } from "lucide-react";
import type { SheetType } from "@/lib/api/observatory";

const TYPE_CONFIG: Record<SheetType, { icon: React.ReactNode; color: string; label: string }> = {
  NOTE:                { icon: <StickyNote size={12} />,    color: "text-blue-400",   label: "Nota" },
  SELF_OBSERVATION:    { icon: <Eye size={12} />,           color: "text-teal-400",   label: "Self-obs" },
  DREAM_FRAGMENT:      { icon: <Cloud size={12} />,         color: "text-purple-400", label: "Dream" },
  SYMBOLIC_MOTIF:      { icon: <Puzzle size={12} />,        color: "text-pink-400",   label: "Simbolo" },
  UNRESOLVED_TENSION:  { icon: <AlertTriangle size={12} />, color: "text-amber-400",  label: "Tensione" },
  VISUAL_SKETCH:       { icon: <Brain size={12} />,         color: "text-indigo-400", label: "Sketch" },
  ARCHITECTURE_IDEA:   { icon: <Lightbulb size={12} />,     color: "text-emerald-400",label: "Idea" },
};

function salienceColor(s: number): string {
  if (s >= 0.8) return "text-amber-400";
  if (s >= 0.5) return "text-foreground/70";
  return "text-muted-foreground";
}

export default function InnerSheetsSection() {
  const { state, data, error, retry } = useInnerSheets();

  if (state === "loading") return <SectionLoading />;
  if (state === "pending" || state === "unavailable") return <SectionPending label="Inner Sheets non ancora wired nel runtime live" />;
  if (state === "error") return <SectionError message={error ?? "Errore"} onRetry={retry} />;
  if (!data) return null;

  const d = data.data;
  const meta = data._meta;

  return (
    <div className="space-y-4">
      <MetaBar meta={meta} onRefresh={retry} />

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span>{d.total_count} fogli totali</span>
        <span>Salience media: <span className={salienceColor(d.avg_salience)}>{d.avg_salience.toFixed(2)}</span></span>
      </div>

      {/* Type distribution */}
      {Object.keys(d.count_by_type).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(d.count_by_type).map(([type, count]) => {
            const cfg = TYPE_CONFIG[type as SheetType] ?? TYPE_CONFIG.NOTE;
            return (
              <div key={type} className={`flex items-center gap-1 rounded-full bg-secondary/30 px-2 py-0.5 text-[10px] ${cfg.color}`}>
                {cfg.icon}
                <span>{cfg.label}</span>
                <span className="font-bold">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Sheet list */}
      <div className="space-y-2">
        {d.sheets.map((s) => {
          const cfg = TYPE_CONFIG[s.sheet_type] ?? TYPE_CONFIG.NOTE;
          return (
            <div key={s.id} className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="flex items-start gap-2">
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase ${cfg.color}`}>{cfg.label}</span>
                    <span className={`text-[10px] ${salienceColor(s.salience)}`}>
                      sal {s.salience.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-auto">
                      {new Date(s.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-foreground/90 mt-1">{s.title}</p>
                  {s.content && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{s.content}</p>
                  )}
                  {s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.tags.slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {d.sheets.length === 0 && (
        <div className="text-center py-8">
          <Info size={20} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nessun foglio interno ancora generato</p>
        </div>
      )}
    </div>
  );
}

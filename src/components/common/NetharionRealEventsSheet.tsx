import { useCallback, useEffect, useState } from "react";
import { X, RefreshCw, Shield, ArrowDown, Database } from "lucide-react";
import {
  getNetharionDebug,
  filterRealEvents,
  filterRelevantEvents,
  type NetharionAuditEntry,
} from "@/lib/api/netharion";

const COLOR_DOT: Record<string, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const COLOR_TEXT: Record<string, string> = {
  green: "text-green-400",
  amber: "text-amber-400",
  red: "text-red-400",
};

const COLOR_LABEL: Record<string, string> = {
  green: "Verde",
  amber: "Arancio",
  red: "Rosso",
};

function colorDot(color: string | null | undefined): string {
  return COLOR_DOT[color ?? ""] ?? "bg-gray-500";
}

function colorText(color: string | null | undefined): string {
  return COLOR_TEXT[color ?? ""] ?? "text-gray-400";
}

function colorLabel(color: string | null | undefined): string {
  return COLOR_LABEL[color ?? ""] ?? color ?? "—";
}

function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatList(values: string[] | undefined): string {
  if (!values || values.length === 0) return "—";
  return values.join(", ");
}

interface NetharionRealEventsSheetProps {
  open: boolean;
  onClose: () => void;
}

const NetharionRealEventsSheet = ({ open, onClose }: NetharionRealEventsSheetProps) => {
  const [events, setEvents] = useState<NetharionAuditEntry[]>([]);
  const [allEvents, setAllEvents] = useState<NetharionAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 0 = relevant (threshold), 1 = transitions, 2 = all raw
  const [viewMode, setViewMode] = useState<0 | 1 | 2>(0);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getNetharionDebug();
      const log = data.audit_log ?? [];
      const relevant = filterRelevantEvents(log);
      setEvents([...relevant].reverse());
      setAllEvents([...log].reverse());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento eventi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchEvents();
    }
  }, [open, fetchEvents]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-[101] flex max-h-[80vh] flex-col rounded-t-2xl border-t border-border bg-background/95 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-neon-purple" />
              <h2 className="font-display text-sm font-bold text-foreground">
                Netharion — Eventi Rilevanti
              </h2>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Database size={11} />
              <span className="truncate">
                {viewMode === 0 && "Filtro: eventi sopra soglia (admitted / resonance ≥ 0.50 / transizione reale)"}
                {viewMode === 1 && "Filtro: solo transizioni colore/modo"}
                {viewMode === 2 && "Tutti gli eventi raw senza filtro"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode((v) => ((v + 1) % 3) as 0 | 1 | 2)}
              className={`flex h-7 items-center gap-1 rounded-full px-2 text-[10px] transition-all ${
                viewMode > 0
                  ? "bg-neon-purple/20 text-neon-purple"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
              aria-label="Cambia filtro eventi"
            >
              {viewMode === 0 ? "Rilevanti" : viewMode === 1 ? "Δ Trans" : "Tutti"}
            </button>
            <button
              type="button"
              onClick={() => void fetchEvents()}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted/30 hover:text-foreground active:scale-90 disabled:opacity-50"
              aria-label="Aggiorna"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted/30 hover:text-foreground active:scale-90"
              aria-label="Chiudi"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 overscroll-contain">
          {error && (
            <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {loading && events.length === 0 && allEvents.length === 0 && (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <RefreshCw size={14} className="mr-2 animate-spin" />
              Caricamento eventi reali...
            </div>
          )}

          {(() => {
            const displayEvents =
              viewMode === 0
                ? events
                : viewMode === 1
                  ? allEvents.filter(
                      (e) =>
                        (e.old_color ?? "") !== (e.new_color ?? "") ||
                        (e.old_mode ?? "") !== (e.new_mode ?? ""),
                    )
                  : allEvents;
            if (!loading && !error && displayEvents.length === 0) {
              return (
                <div className="rounded-xl border border-border/50 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
                  {viewMode === 0
                    ? "Nessun evento sopra soglia di rilevanza."
                    : viewMode === 1
                      ? "Nessuna transizione di colore/modo."
                      : "Nessun evento nel audit_log backend."}
                </div>
              );
            }
            if (displayEvents.length > 0) {
              return (
                <div className="space-y-2">
                  {displayEvents.map((ev, i) => {
                    const isRelevant = ev.admitted || ev.resonance_score >= 0.50;
                    return (
                      <EventCard
                        key={`${ev.ts}-${i}`}
                        event={ev}
                        highlight={viewMode !== 0 && isRelevant}
                      />
                    );
                  })}
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </>
  );
};

function EventCard({ event, highlight }: { event: NetharionAuditEntry; highlight?: boolean }) {
  const oldColor = event.old_color ?? null;
  const newColor = event.new_color ?? null;
  const oldMode = event.old_mode ?? "—";
  const newMode = event.new_mode ?? "—";

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        highlight
          ? "border-neon-purple/50 bg-neon-purple/10"
          : "border-border/50 bg-muted/20"
      }`}
    >
      <div className="mb-1.5 text-[10px] text-muted-foreground">{formatTs(event.ts)}</div>

      <div className="mb-1 flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorDot(oldColor)}`} />
          <span className={`text-xs font-medium ${colorText(oldColor)}`}>{colorLabel(oldColor)}</span>
        </div>
        <ArrowDown size={10} className="rotate-[-90deg] text-muted-foreground" />
        <div className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorDot(newColor)}`} />
          <span className={`text-xs font-medium ${colorText(newColor)}`}>{colorLabel(newColor)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Modo: {oldMode}</span>
        <span>→</span>
        <span>{newMode}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/70">
        <span>R: {typeof event.resonance_score === "number" ? event.resonance_score.toFixed(3) : "—"}</span>
        <span>S: {typeof event.stability_score === "number" ? event.stability_score.toFixed(3) : "—"}</span>
        <span>P: {typeof event.pulse_strength === "number" ? event.pulse_strength.toFixed(3) : "—"}</span>
        {event.admitted && <span className="font-semibold text-red-400">ADMITTED</span>}
      </div>

      <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground/80">
        <div>
          <span className="font-semibold text-foreground/80">Reason:</span> {event.reason || "—"}
        </div>
        <div>
          <span className="font-semibold text-foreground/80">Passed:</span> {formatList(event.thresholds_passed)}
        </div>
        <div>
          <span className="font-semibold text-foreground/80">Failed:</span> {formatList(event.thresholds_failed)}
        </div>
        <div>
          <span className="font-semibold text-foreground/80">Trace refs:</span> {formatList(event.trace_refs)}
        </div>
      </div>
    </div>
  );
}

export default NetharionRealEventsSheet;

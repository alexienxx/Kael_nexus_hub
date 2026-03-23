import { useEffect, useState, useCallback } from "react";
import { X, RefreshCw, Shield, ArrowDown } from "lucide-react";
import {
  getNetharionDebug,
  filterRealEvents,
  type NetharionAuditEntry,
} from "@/lib/api/netharion";

// ---------------------------------------------------------------------------
// Color mapping — 1:1 with backend new_color, no reinterpretation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NetharionRealEventsSheetProps {
  open: boolean;
  onClose: () => void;
}

const NetharionRealEventsSheet = ({ open, onClose }: NetharionRealEventsSheetProps) => {
  const [events, setEvents] = useState<NetharionAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNetharionDebug();
      const real = filterRealEvents(data.audit_log ?? []);
      // Most recent first
      setEvents(real.reverse());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento eventi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchEvents();
  }, [open, fetchEvents]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — tap to close */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[101] max-h-[80vh] flex flex-col rounded-t-2xl bg-background/95 border-t border-border shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-neon-purple" />
            <h2 className="font-display text-sm font-bold text-foreground">
              Netharion Real Events
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all active:scale-90 disabled:opacity-50"
              aria-label="Aggiorna"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all active:scale-90"
              aria-label="Chiudi"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 overscroll-contain">
          {error && (
            <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {loading && events.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
              <RefreshCw size={14} className="animate-spin mr-2" /> Caricamento...
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Shield size={28} className="mb-2 opacity-40" />
              <p className="text-xs">Nessun evento reale registrato</p>
              <p className="text-[10px] mt-1 opacity-60">
                Le transizioni di colore/modo appariranno qui
              </p>
            </div>
          )}

          {events.length > 0 && (
            <div className="space-y-2">
              {events.map((ev, i) => (
                <EventCard key={`${ev.ts}-${i}`} event={ev} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Single event card
// ---------------------------------------------------------------------------

function EventCard({ event }: { event: NetharionAuditEntry }) {
  const oldColor = event.old_color ?? null;
  const newColor = event.new_color ?? null;
  const oldMode = event.old_mode ?? "—";
  const newMode = event.new_mode ?? "—";

  return (
    <div className="rounded-xl bg-muted/20 border border-border/50 px-3 py-2.5">
      {/* Timestamp */}
      <div className="text-[10px] text-muted-foreground mb-1.5">
        {formatTs(event.ts)}
      </div>

      {/* Color transition row */}
      <div className="flex items-center gap-2 mb-1">
        <div className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorDot(oldColor)}`} />
          <span className={`text-xs font-medium ${colorText(oldColor)}`}>
            {colorLabel(oldColor)}
          </span>
        </div>
        <ArrowDown size={10} className="text-muted-foreground rotate-[-90deg]" />
        <div className="flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorDot(newColor)}`} />
          <span className={`text-xs font-medium ${colorText(newColor)}`}>
            {colorLabel(newColor)}
          </span>
        </div>
      </div>

      {/* Mode transition row */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Modo: {oldMode}</span>
        <span>→</span>
        <span>{newMode}</span>
      </div>

      {/* Scores */}
      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/70">
        <span>R: {typeof event.resonance_score === "number" ? event.resonance_score.toFixed(3) : "—"}</span>
        <span>S: {typeof event.stability_score === "number" ? event.stability_score.toFixed(3) : "—"}</span>
        <span>P: {typeof event.pulse_strength === "number" ? event.pulse_strength.toFixed(3) : "—"}</span>
        {event.admitted && (
          <span className="text-red-400 font-semibold">ADMITTED</span>
        )}
      </div>
    </div>
  );
}

export default NetharionRealEventsSheet;

import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import type { TextOutboxSummary } from "@/lib/chat/durableExchangeStore";

interface OutboxAttentionPanelProps {
  summary: TextOutboxSummary;
  busyClientMessageId: string | null;
  onRetry: (clientMessageId: string) => void;
  onRemove: (clientMessageId: string) => void;
}

function stateLabel(state: string): string {
  if (state === "authentication_required") return "Autenticazione richiesta";
  return state === "recovery_required" ? "Recupero da verificare" : "Invio bloccato";
}

export default function OutboxAttentionPanel({
  summary,
  busyClientMessageId,
  onRetry,
  onRemove,
}: OutboxAttentionPanelProps) {
  const nearingCapacity = summary.total >= Math.floor(summary.capacity * 0.8);
  if (!summary.attention.length && !nearingCapacity) return null;

  return (
    <section
      aria-label="Gestione messaggi chat in sospeso"
      className="relative z-20 mx-3 mt-2 rounded-xl border border-amber-400/40 bg-background/95 p-3 text-xs shadow-lg backdrop-blur"
      data-testid="outbox-attention-panel"
    >
      <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-300">
        <AlertTriangle size={15} />
        <span>Outbox chat: {summary.total}/{summary.capacity}</span>
      </div>
      {summary.attention.length > 0 && (
        <p className="mt-1 text-muted-foreground">
          Il primo messaggio richiede una scelta. I successivi restano fermi per rispettare l'ordine.
        </p>
      )}

      <div className="mt-2 space-y-2">
        {summary.attention.map((entry) => {
          const busy = busyClientMessageId === entry.clientMessageId;
          return (
            <article
              key={entry.clientMessageId}
              className="rounded-lg border border-border/70 bg-muted/40 p-2"
              data-testid={`outbox-attention-${entry.clientMessageId}`}
            >
              <div className="font-medium">{stateLabel(entry.state)}</div>
              <p className="mt-1 line-clamp-2 break-words text-muted-foreground">
                {entry.requestBody.text}
              </p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[10px] text-muted-foreground">
                <dt>Tentativi</dt><dd>{entry.attempts}</dd>
                <dt>Errore</dt><dd className="break-all">{entry.errorCode ?? "non specificato"}</dd>
                {entry.exchangeId && <><dt>Scambio</dt><dd className="break-all">{entry.exchangeId}</dd></>}
              </dl>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRetry(entry.clientMessageId)}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  <RotateCcw size={12} /> Riprova stesso invio
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(entry.clientMessageId)}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 size={12} /> Rimuovi
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

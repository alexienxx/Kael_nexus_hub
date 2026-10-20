import { useState } from "react";
import { X } from "lucide-react";
import type { TextOutboxSummary } from "@/lib/chat/durableExchangeStore";

interface OutboxAttentionPanelProps {
  summary: TextOutboxSummary;
  busyClientMessageId: string | null;
  onRetry: (clientMessageId: string) => void;
  onRemove: (clientMessageId: string) => void;
}

export default function OutboxAttentionPanel({ summary, busyClientMessageId, onRetry, onRemove }: OutboxAttentionPanelProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const entry = summary.attention[0];
  const full = summary.total >= summary.capacity;
  if (!entry && !full) return null;
  const identity = entry ? `${entry.clientMessageId}:${entry.state}` : "queue-full";
  if (dismissed === identity) return null;
  const busy = entry?.clientMessageId === busyClientMessageId;
  return <section role="alert" aria-label="Problema di invio" data-testid="outbox-attention-panel"
    className="relative z-20 mx-3 mt-2 rounded-xl bg-background/95 px-3 py-2 text-xs">
    <div className="flex items-center justify-between gap-2">
      <p>{entry?.state === "authentication_required" ? "Accedi per inviare messaggi."
        : entry ? "Non è stato possibile completare una richiesta."
        : "Troppi messaggi in attesa. Riprova più tardi."}</p>
      <button type="button" aria-label="Chiudi avviso" onClick={() => setDismissed(identity)}><X size={16} /></button>
    </div>
    {entry && <div className="mt-2 flex gap-3">
      <button type="button" disabled={busy} onClick={() => onRetry(entry.clientMessageId)}>Riprova</button>
      <button type="button" disabled={busy} onClick={() => onRemove(entry.clientMessageId)}>Annulla invio</button>
    </div>}
  </section>;
}

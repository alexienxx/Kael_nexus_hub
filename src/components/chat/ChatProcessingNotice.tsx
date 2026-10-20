import { useState } from "react";
import { X } from "lucide-react";
import type { ChatProcessingState } from "@/lib/chat/processingNotice";

export default function ChatProcessingNotice({ state, onDefer }: { state: ChatProcessingState | null; onDefer?: (id: string) => void }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!state || ["waiting", "in_progress", "silence", "unconfirmed"].includes(state.kind)) return null;
  const identity = `${state.clientMessageId ?? ""}:${state.kind}:${state.errorCode ?? ""}`;
  if (dismissed === identity) return null;
  const title = state.kind === "authentication_required" ? "Accedi per inviare messaggi."
    : state.kind === "retryable_failure" || state.kind === "transport_deferred"
      ? "Connessione non disponibile." : "Non è stato possibile completare la richiesta.";
  // Presentation never mutates the retained receipt, retries or certifies delivery.
  return <section role="alert" data-testid="chat-processing-notice"
    className="relative z-20 mx-3 mt-2 flex items-center justify-between gap-2 rounded-xl bg-background/95 px-3 py-2 text-xs">
    <p>{title}</p>
    {onDefer && state.clientMessageId && ["retryable_failure", "transport_deferred"].includes(state.kind) && <button type="button" onClick={() => onDefer(state.clientMessageId!)}>Invia più tardi</button>}
    <button type="button" aria-label="Chiudi avviso" onClick={() => setDismissed(identity)}><X size={16} /></button>
  </section>;
}

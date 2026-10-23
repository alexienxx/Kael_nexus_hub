import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ChatProcessingState } from "@/lib/chat/processingNotice";

export default function ChatProcessingNotice({ state, onDefer }: { state: ChatProcessingState | null; onDefer?: (id: string) => void }) {
  const identity = state?.clientMessageId && !["waiting", "in_progress", "silence", "unconfirmed"].includes(state.kind)
    ? `${state.clientMessageId}:${state.kind}:${state.errorCode ?? ""}` : null;
  const previousIdentity = useRef(identity);
  const [visibleIdentity, setVisibleIdentity] = useState<string | null>(null);
  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    setVisibleIdentity(identity);
    if (!identity) return;
    const timer = window.setTimeout(() => setVisibleIdentity(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [identity]);
  if (!state || !identity || visibleIdentity !== identity) return null;
  const title = state.kind === "authentication_required" ? "Accedi per inviare messaggi."
    : state.kind === "retryable_failure" || state.kind === "transport_deferred"
      ? "Connessione non disponibile." : "Non è stato possibile completare la richiesta.";
  // Presentation never mutates the retained receipt, retries or certifies delivery.
  return <section role="alert" data-testid="chat-processing-notice"
    className="relative z-20 mx-3 mt-2 flex items-center justify-between gap-2 rounded-xl bg-background/95 px-3 py-2 text-xs">
    <p>{title}</p>
    {onDefer && state.clientMessageId && ["retryable_failure", "transport_deferred"].includes(state.kind) && <button type="button" onClick={() => onDefer(state.clientMessageId!)}>Invia più tardi</button>}
    <button type="button" aria-label="Chiudi avviso" onClick={() => setVisibleIdentity(null)}><X size={16} /></button>
  </section>;
}

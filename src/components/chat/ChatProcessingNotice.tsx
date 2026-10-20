import type { ChatProcessingState } from "@/lib/chat/processingNotice";

export default function ChatProcessingNotice({ state }: { state: ChatProcessingState | null }) {
  if (!state) return null;
  let title: string;
  let detail: string;
  switch (state.kind) {
    case "waiting":
      title = "In attesa del server";
      detail = "La generazione di una risposta non è ancora confermata.";
      break;
    case "in_progress":
      title = "Ultimo stato confermato: elaborazione in corso";
      detail = "È un aggiornamento del server, non un segnale continuo di generazione.";
      break;
    case "silence":
      title = "Elaborazione conclusa senza una risposta";
      detail = "Il server ha confermato questo esito; non è un errore di consegna.";
      break;
    case "recovery_required":
      title = "Recupero da verificare";
      detail = "L'esito richiede verifica. Nessun reinvio automatico per questo stato.";
      break;
    case "authentication_required":
      title = "Accesso al server richiesto";
      detail = "La richiesta non può proseguire finché l'accesso non è verificato.";
      break;
    case "terminal_failure":
    case "integrity_failure":
      title = "Elaborazione non completata";
      detail = "Non è disponibile una risposta confermata. Controlla l'avviso dello scambio.";
      break;
    case "retryable_failure":
    case "transport_deferred":
    case "unconfirmed":
      title = "Esito della richiesta non confermato";
      detail = "Non è possibile confermare generazione o consegna della risposta a questa richiesta.";
      break;
  }
  // Only bounded technical identifiers belong in this status surface, never
  // an arbitrary backend detail/message that could contain private content.
  const code = state.errorCode && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(state.errorCode)
    ? state.errorCode : null;
  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="chat-processing-notice"
      data-outcome={state.kind}
      className="relative z-20 mx-3 mb-2 rounded-xl border border-border bg-background/95 px-3 py-2 text-xs shadow-sm"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{detail}</p>
      {code && <p className="mt-1 break-all font-mono text-[10px]">Codice: {code}</p>}
    </section>
  );
}

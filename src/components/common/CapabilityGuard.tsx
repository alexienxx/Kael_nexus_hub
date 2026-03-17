import {
  Loader2,
  WifiOff,
  AlertTriangle,
  Inbox,
  Clock,
  ServerOff,
} from "lucide-react";
import type { CapabilityState } from "@/hooks/useCapability";

/**
 * CAPABILITY-TRUTH UI COMPONENT
 *
 * Reusable component that renders the appropriate state for any
 * capability-dependent surface. Replaces scattered loading/error/placeholder patterns.
 */

interface CapabilityGuardProps {
  state: CapabilityState;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;

  // Customizable labels for each state
  loadingLabel?: string;
  unavailableLabel?: string;
  unavailableDescription?: string;
  errorLabel?: string;
  emptyLabel?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  pendingLabel?: string;
  pendingDescription?: string;
}

const CapabilityGuard = ({
  state,
  error,
  onRetry,
  children,
  loadingLabel = "Caricamento...",
  unavailableLabel = "Backend non disponibile",
  unavailableDescription = "Configura la connessione in Settings → Connessione",
  errorLabel = "Si è verificato un errore",
  emptyLabel = "Nessun contenuto",
  emptyDescription = "Non ci sono ancora dati da mostrare",
  emptyIcon,
  pendingLabel = "In arrivo",
  pendingDescription = "Questa funzionalità sarà disponibile a breve",
}: CapabilityGuardProps) => {
  if (state === "available") {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
      {state === "loading" && (
        <>
          <Loader2 size={32} className="animate-spin text-neon-purple/60" />
          <p className="text-sm text-muted-foreground">{loadingLabel}</p>
        </>
      )}

      {state === "unavailable" && (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <WifiOff size={24} className="text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/80">{unavailableLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{unavailableDescription}</p>
          </div>
          {onRetry && <RetryButton onClick={onRetry} />}
        </>
      )}

      {state === "error" && (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle size={24} className="text-destructive/70" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/80">{errorLabel}</p>
            {error && (
              <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">{error}</p>
            )}
          </div>
          {onRetry && <RetryButton onClick={onRetry} />}
        </>
      )}

      {state === "empty" && (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            {emptyIcon || <Inbox size={24} className="text-muted-foreground/60" />}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/70">{emptyLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
          </div>
        </>
      )}

      {state === "pending" && (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neon-purple/10">
            <Clock size={24} className="text-neon-purple/60" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/70">{pendingLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{pendingDescription}</p>
          </div>
        </>
      )}
    </div>
  );
};

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass mt-2 rounded-full px-5 py-2 text-xs font-medium text-neon-purple transition-all hover:scale-105 active:scale-95"
    >
      Riprova
    </button>
  );
}

export default CapabilityGuard;

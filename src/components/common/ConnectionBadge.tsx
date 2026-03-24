import type { BackendLifecycleState } from "@/types";

interface StatusVisual {
  label: string;
  color: string;
  dot: string;
  showLabel: boolean;
}

const stateConfig: Record<BackendLifecycleState, StatusVisual> = {
  checking:              { label: "Connessione...",       color: "text-yellow-400",        dot: "bg-yellow-400 animate-pulse",    showLabel: true },
  online:                { label: "Online",               color: "text-online",            dot: "bg-online",                      showLabel: false },
  starting:              { label: "Server in avvio...",   color: "text-yellow-400",        dot: "bg-red-500 animate-pulse",       showLabel: true },
  waiting:               { label: "Server in avvio...",   color: "text-yellow-400",        dot: "bg-red-500 animate-pulse",       showLabel: true },
  start_failed:          { label: "Avvio fallito",        color: "text-destructive",       dot: "bg-destructive",                 showLabel: true },
  offline:               { label: "Offline",              color: "text-muted-foreground",  dot: "bg-muted-foreground",            showLabel: true },
  offline_network:       { label: "No rete",              color: "text-orange-400",        dot: "bg-orange-400",                  showLabel: true },
  backend_unreachable:   { label: "Irraggiungibile",      color: "text-destructive",       dot: "bg-destructive",                 showLabel: true },
};

interface ConnectionBadgeProps {
  lifecycleState: BackendLifecycleState;
  message?: string;
}

const ConnectionBadge = ({ lifecycleState, message }: ConnectionBadgeProps) => {
  const cfg = stateConfig[lifecycleState];
  const displayLabel = message || cfg.label;

  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {(cfg.showLabel || lifecycleState !== "online") && (
        <span className={`text-[10px] ${cfg.color} truncate max-w-[140px]`}>
          {displayLabel}
        </span>
      )}
    </div>
  );
};

export default ConnectionBadge;

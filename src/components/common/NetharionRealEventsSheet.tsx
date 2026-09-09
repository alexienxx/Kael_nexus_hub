import { Database, RefreshCw, Shield, X } from "lucide-react";
import type {
  NetharionChannelSnapshot,
  NetharionChannelState,
} from "@/lib/api/netharion";

interface NetharionChannelSheetProps {
  open: boolean;
  onClose: () => void;
  channel: NetharionChannelSnapshot | null;
  state: NetharionChannelState;
  error: string | null;
  onRefresh: () => Promise<void>;
}

const STATE_LABEL: Record<NetharionChannelState, string> = {
  OFF: "Spento",
  ACTIVE: "Scambio attivo",
  RECEIVING: "Ricezione in corso",
  VERIFIED: "Verificato e salvato",
  DEGRADED: "Degradato",
};

const STATE_COLOR: Record<NetharionChannelState, string> = {
  OFF: "text-slate-400",
  ACTIVE: "text-sky-400",
  RECEIVING: "text-amber-400",
  VERIFIED: "text-emerald-400",
  DEGRADED: "text-red-400",
};

function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const NetharionChannelSheet = ({
  open,
  onClose,
  channel,
  state,
  error,
  onRefresh,
}: NetharionChannelSheetProps) => {
  if (!open) return null;
  const observations = [...(channel?.recent_observations ?? [])].reverse();

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[101] flex max-h-[80vh] flex-col rounded-t-2xl border-t border-border bg-background/95 shadow-2xl">
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-neon-purple" />
              <h2 className="font-display text-sm font-bold">Netharion — Canale esterno</h2>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Solo ricezione autenticata e provenienza; nessuna presenza o stato emotivo.
            </p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => void onRefresh()} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground" aria-label="Aggiorna canale">
              <RefreshCw size={14} />
            </button>
            <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground" aria-label="Chiudi">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Stato tecnico</span>
              <span className={`text-xs font-bold ${STATE_COLOR[state]}`}>{state} · {STATE_LABEL[state]}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <Metric label="Scambi attivi" value={channel?.active_exchange_count ?? 0} />
              <Metric label="Ricezioni accettate" value={channel?.accepted_total ?? 0} />
              <Metric label="Ricezioni rifiutate" value={channel?.rejected_total ?? 0} />
              <Metric label="Ultima verifica" value={formatTs(channel?.last_verified_at)} />
              <Metric label="Provider" value={channel?.last_provider ?? "—"} />
              <Metric label="Agente" value={channel?.last_agent_id ?? "—"} />
            </div>
            {(error || channel?.last_error_code) && (
              <div className="mt-3 rounded-lg bg-red-500/10 px-2 py-1.5 text-[10px] text-red-400">
                {channel?.last_error_code ?? error}
              </div>
            )}
          </div>

          <div className="mb-2 mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Database size={11} />
            Ricevute recenti — solo metadati, nessun contenuto
          </div>
          {observations.length === 0 ? (
            <div className="rounded-xl border border-border/50 px-3 py-3 text-xs text-muted-foreground">
              Nessuna ricezione verificata in questa esecuzione.
            </div>
          ) : (
            <div className="space-y-2">
              {observations.map((receipt) => (
                <div key={receipt.observation_id} className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-[10px]">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-foreground">{receipt.provider} · {receipt.agent_id}</span>
                    <span className="text-muted-foreground">{formatTs(receipt.received_at)}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">{receipt.observation_type} · {receipt.content_length} caratteri</div>
                  <div className="mt-1 break-all font-mono text-muted-foreground/70">sha256 {receipt.content_sha256.slice(0, 16)}…</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-black/10 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium text-foreground">{value}</div>
    </div>
  );
}

export default NetharionChannelSheet;

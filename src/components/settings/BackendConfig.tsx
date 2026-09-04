import { useState, useEffect } from "react";
import { Globe, Key, CheckCircle, XCircle, Loader2, Power, AlertTriangle } from "lucide-react";
import { getApiConfig, setApiConfig, verifyBackendConfig } from "@/lib/api/client";
import { useServerRestart } from "@/hooks/useServerRestart";

const BackendConfig = () => {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const { state: restartState, message: restartMessage, proof: restartProof, restartServer, reset: resetRestart } = useServerRestart();

  useEffect(() => {
    const config = getApiConfig();
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
  }, []);

  const handleSave = async () => {
    setStatus("checking");
    const candidate = {
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      apiKey: apiKey.trim(),
    };
    try {
      // Public health proves service identity; /auth/verify proves the
      // credential. The candidate is persisted only after both succeed.
      await verifyBackendConfig(candidate);
      setApiConfig(candidate);
      setBaseUrl(candidate.baseUrl);
      setApiKey(candidate.apiKey);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="px-4 py-4 space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Backend URL
        </h3>
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-neon-purple shrink-0" />
            <input
              type="url"
              placeholder="https://your-backend.com/api"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Credenziale Kael (obbligatoria)
        </h3>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-neon-purple shrink-0" />
            <input
              type="password"
              placeholder="Inserisci la credenziale del backend"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={!baseUrl.trim() || !apiKey.trim() || status === "checking"}
        className="w-full rounded-xl bg-gradient-to-r from-neon-purple to-accent py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-neon-purple/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
      >
        Salva e Testa Connessione
      </button>

      {/* Status */}
      {status !== "idle" && (
        <div
          className={`glass flex items-center gap-2 rounded-xl p-3 ${
            status === "ok"
              ? "text-online"
              : status === "error"
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
        >
          {status === "checking" && <Loader2 size={16} className="animate-spin" />}
          {status === "ok" && <CheckCircle size={16} />}
          {status === "error" && <XCircle size={16} />}
          <span className="text-xs font-medium">
            {status === "checking" && "Connessione in corso..."}
            {status === "ok" && "Backend autenticato e connesso! ✨"}
            {status === "error" && "Connessione o credenziale non valida"}
          </span>
        </div>
      )}

      <p className="text-[10px] text-center text-muted-foreground/50">
        Il cervello di Kael vive nel tuo backend esterno.
        <br />
        URL e credenziale valida sono entrambi necessari per connettere l'app.
      </p>

      {/* ── Avanzate ──────────────────────────────────────────────── */}
      <section>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between text-xs text-muted-foreground py-2"
        >
          <span className="font-semibold uppercase tracking-wider">Avanzate</span>
          <span className="text-[10px]">{showAdvanced ? "▲" : "▼"}</span>
        </button>

        {showAdvanced && (
          <div className="glass rounded-xl p-4 space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1">Riavvia Server</h4>
              <p className="text-[10px] text-muted-foreground mb-3">
                Invia un comando al sentinel (porta 8099) per riavviare il backend.
                Usa questa funzione SOLO se il server è bloccato o non risponde.
              </p>

              {/* Confirmation gate */}
              {!confirmRestart && restartState === "idle" && (
                <button
                  onClick={() => setConfirmRestart(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-2.5 text-sm font-medium text-destructive transition-all active:scale-[0.98]"
                >
                  <Power size={16} />
                  Riavvia Server
                </button>
              )}

              {confirmRestart && restartState === "idle" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 p-2.5 text-yellow-500">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span className="text-[11px]">
                      Questo riavvierà il backend Kael. Sei sicuro?
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmRestart(false)}
                      className="flex-1 rounded-xl border border-border py-2 text-xs text-muted-foreground"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={() => {
                        setConfirmRestart(false);
                        restartServer();
                      }}
                      className="flex-1 rounded-xl bg-destructive py-2 text-xs font-semibold text-destructive-foreground"
                    >
                      Conferma riavvio
                    </button>
                  </div>
                </div>
              )}

              {restartState === "restarting" && (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 p-3 text-yellow-500">
                  <Loader2 size={16} className="animate-spin shrink-0" />
                  <span className="text-xs">{restartMessage}</span>
                </div>
              )}

              {restartState === "success" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-500">
                    <CheckCircle size={16} />
                    <span className="text-xs">{restartMessage}</span>
                  </div>
                  {restartProof && (
                    <div className="rounded-lg bg-muted/30 p-2.5 space-y-0.5 text-[10px] text-muted-foreground font-mono">
                      {restartProof.pidChanged && (
                        <p>PID: {restartProof.oldPid} → {restartProof.newPid}</p>
                      )}
                      {restartProof.newSessionId && (
                        <p>Session: {restartProof.newSessionId.slice(0, 20)}...</p>
                      )}
                      {restartProof.newUptime && (
                        <p>Uptime: {restartProof.newUptime}</p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={resetRestart}
                    className="w-full rounded-xl border border-border py-2 text-xs text-muted-foreground"
                  >
                    OK
                  </button>
                </div>
              )}

              {restartState === "error" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                    <XCircle size={16} />
                    <span className="text-xs">{restartMessage}</span>
                  </div>
                  <button
                    onClick={resetRestart}
                    className="w-full rounded-xl border border-border py-2 text-xs text-muted-foreground"
                  >
                    Chiudi
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default BackendConfig;

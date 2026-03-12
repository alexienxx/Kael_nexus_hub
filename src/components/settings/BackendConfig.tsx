import { useState, useEffect } from "react";
import { Globe, Key, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { getApiConfig, setApiConfig, checkHealth } from "@/lib/api/client";

const BackendConfig = () => {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");

  useEffect(() => {
    const config = getApiConfig();
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
  }, []);

  const handleSave = async () => {
    setApiConfig({ baseUrl, apiKey });
    setStatus("checking");
    const ok = await checkHealth();
    setStatus(ok ? "ok" : "error");
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
          API Key (opzionale)
        </h3>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-neon-purple shrink-0" />
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={!baseUrl}
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
            {status === "ok" && "Backend connesso! ✨"}
            {status === "error" && "Impossibile raggiungere il backend"}
          </span>
        </div>
      )}

      <p className="text-[10px] text-center text-muted-foreground/50">
        Il cervello di Kael vive nel tuo backend esterno.
        <br />
        Configura qui l'URL per connettere l'app.
      </p>
    </div>
  );
};

export default BackendConfig;

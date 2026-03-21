import { useState, useEffect } from "react";
import { Key, Bot, ChevronDown } from "lucide-react";
import {
  getExternalAgentConfig,
  setExternalAgentConfig,
  AGENT_MODELS,
  type AgentProvider,
} from "@/lib/externalAgent";

const providerGroups: { provider: AgentProvider; label: string }[] = [
  { provider: "openai", label: "OpenAI" },
  { provider: "anthropic", label: "Anthropic" },
  { provider: "google", label: "Google" },
];

const ExternalAgentSettings = () => {
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("gpt-4o");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const config = getExternalAgentConfig();
    setApiKey(config.apiKey);
    setModelId(config.modelId);
  }, []);

  const handleSave = () => {
    setExternalAgentConfig({ apiKey, modelId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const selectedModel = AGENT_MODELS.find((m) => m.id === modelId) || AGENT_MODELS[0];

  return (
    <div className="px-4 py-4 space-y-6">
      {/* API Key */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          API Key
        </h3>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Key size={16} className="text-neon-purple shrink-0" />
            <input
              type="password"
              placeholder="sk-... / anthropic-... / AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          La chiave viene usata per autenticarti con il provider selezionato.
        </p>
      </section>

      {/* Model Selection */}
      <section>
        <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Modello
        </h3>
        <div className="space-y-3">
          {providerGroups.map(({ provider, label }) => (
            <div key={provider}>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5 ml-1">
                {label}
              </p>
              <div className="space-y-1">
                {AGENT_MODELS.filter((m) => m.provider === provider).map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setModelId(model.id)}
                    className={`glass flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                      modelId === model.id
                        ? "ring-1 ring-neon-purple/60 bg-neon-purple/10"
                        : "hover:bg-accent/10"
                    }`}
                  >
                    <Bot size={16} className={modelId === model.id ? "text-neon-purple" : "text-muted-foreground"} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{model.label}</p>
                      <p className="text-[10px] text-muted-foreground">{model.id}</p>
                    </div>
                    {modelId === model.id && (
                      <div className="h-2 w-2 rounded-full bg-neon-purple" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full rounded-xl bg-gradient-to-r from-neon-purple to-accent py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-neon-purple/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        {saved ? "Salvato ✨" : "Salva Configurazione"}
      </button>

      <p className="text-[10px] text-center text-muted-foreground/50">
        Modello attivo: {selectedModel.providerLabel} · {selectedModel.label}
      </p>
    </div>
  );
};

export default ExternalAgentSettings;

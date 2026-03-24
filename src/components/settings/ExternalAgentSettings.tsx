import { useState, useEffect } from "react";
import { Bot, Settings2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getExternalAgentConfig,
  setExternalAgentConfig,
  getSystemPrompt,
  setSystemPrompt as saveSystemPrompt,
  AGENT_MODELS,
  type AgentProvider,
} from "@/lib/externalAgent";

const providerGroups: { provider: AgentProvider; label: string }[] = [
  { provider: "openai", label: "OpenAI" },
  { provider: "anthropic", label: "Anthropic" },
  { provider: "google", label: "Google" },
];

const ExternalAgentSettings = () => {
  const [modelId, setModelId] = useState("gpt-4o");
  const [saved, setSaved] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    const config = getExternalAgentConfig();
    setModelId(config.modelId);
    setSystemPrompt(getSystemPrompt());
  }, []);

  const handleSave = () => {
    setExternalAgentConfig({ modelId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSavePrompt = () => {
    saveSystemPrompt(systemPrompt.trim());
    setShowPromptEditor(false);
  };

  const selectedModel = AGENT_MODELS.find((m) => m.id === modelId) || AGENT_MODELS[0];
  const hasPrompt = systemPrompt.trim().length > 0;

  // --- System Prompt Editor Overlay ---
  if (showPromptEditor) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h3 className="text-sm font-semibold text-foreground">System Prompt</h3>
          <button
            onClick={() => {
              setSystemPrompt(getSystemPrompt()); // reset to saved
              setShowPromptEditor(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 flex-1 flex flex-col gap-3">
          <p className="text-[10px] text-muted-foreground/70">
            Istruzioni che verranno inviate all'agente prima di ogni conversazione.
            Es: "Rispondi sempre in italiano", "Sei un assistente tecnico esperto di React".
          </p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Es: Rispondi sempre in italiano. Sii conciso e diretto."
            className="flex-1 w-full rounded-xl glass p-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-neon-purple/40 resize-none"
          />
          <div className="flex gap-2 pb-4">
            {hasPrompt && (
              <button
                onClick={() => {
                  setSystemPrompt("");
                  saveSystemPrompt("");
                  setShowPromptEditor(false);
                }}
                className="flex-1 rounded-xl glass py-3 text-sm font-medium text-destructive transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                Rimuovi
              </button>
            )}
            <button
              onClick={handleSavePrompt}
              className="flex-1 rounded-xl bg-gradient-to-r from-neon-purple to-accent py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-neon-purple/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              Salva Prompt
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Settings View ---
  return (
    <div className="flex flex-col h-full">
      {/* Header with gear icon */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <div />
        <button
          onClick={() => setShowPromptEditor(true)}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110 ${
            hasPrompt ? "text-neon-purple" : "text-muted-foreground hover:text-foreground"
          }`}
          aria-label="System Prompt"
          title="System Prompt"
        >
          <Settings2 size={18} />
          {hasPrompt && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-neon-purple" />
          )}
        </button>
      </div>

      {/* Active prompt indicator */}
      {hasPrompt && (
        <button
          onClick={() => setShowPromptEditor(true)}
          className="mx-4 mb-2 glass rounded-xl px-4 py-2.5 text-left transition-all hover:bg-accent/10"
        >
          <p className="text-[10px] font-medium text-neon-purple mb-0.5">System Prompt attivo</p>
          <p className="text-[10px] text-muted-foreground truncate">{systemPrompt}</p>
        </button>
      )}

      {/* Model list — scrollable */}
      <div className="px-4 pb-1">
        <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Modello
        </h3>
      </div>
      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 pb-4">
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
      </ScrollArea>

      {/* Save — fixed bottom */}
      <div className="px-4 py-4 space-y-2">
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
    </div>
  );
};

export default ExternalAgentSettings;

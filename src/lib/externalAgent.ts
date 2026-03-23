/**
 * External Agent Configuration & Chat
 * 
 * Supports OpenAI, Anthropic (Claude), and Google (Gemini) APIs
 * via Lovable AI Gateway proxy edge function.
 */

export type AgentProvider = "openai" | "anthropic" | "google";

export interface AgentModel {
  id: string;
  label: string;        // Short label shown in bubble e.g. "GPT-5.2"
  provider: AgentProvider;
  providerLabel: string; // e.g. "OpenAI", "Anthropic", "Google"
}

export const AGENT_MODELS: AgentModel[] = [
  // OpenAI
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-5.3", label: "GPT-5.3", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-5", label: "GPT-5", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", providerLabel: "OpenAI" },
  { id: "o3-pro", label: "o3 Pro", provider: "openai", providerLabel: "OpenAI" },
  { id: "o3-mini", label: "o3 Mini", provider: "openai", providerLabel: "OpenAI" },
  // Anthropic
  { id: "claude-sonnet-4-20250514", label: "Sonnet 4", provider: "anthropic", providerLabel: "Anthropic" },
  { id: "claude-3-5-sonnet-20241022", label: "Sonnet 3.5", provider: "anthropic", providerLabel: "Anthropic" },
  { id: "claude-3-opus-20240229", label: "Opus 3", provider: "anthropic", providerLabel: "Anthropic" },
  { id: "claude-3-haiku-20240307", label: "Haiku 3", provider: "anthropic", providerLabel: "Anthropic" },
  // Google
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", providerLabel: "Google" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", providerLabel: "Google" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google", providerLabel: "Google" },
];

const STORAGE_KEY = "kael_external_agent_config";
const SYSTEM_PROMPT_KEY = "kael_external_agent_system_prompt";

export interface ExternalAgentConfig {
  apiKey: string;
  modelId: string;
}

export function getExternalAgentConfig(): ExternalAgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { apiKey: "", modelId: "gpt-5.4" };
}

export function setExternalAgentConfig(config: ExternalAgentConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getSystemPrompt(): string {
  return localStorage.getItem(SYSTEM_PROMPT_KEY) || "";
}

export function setSystemPrompt(prompt: string) {
  localStorage.setItem(SYSTEM_PROMPT_KEY, prompt);
}

export function getSelectedModel(): AgentModel {
  const config = getExternalAgentConfig();
  return AGENT_MODELS.find((m) => m.id === config.modelId) || AGENT_MODELS[0];
}

export interface ExternalChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Send a message to the external agent via edge function proxy.
 * The edge function handles provider-specific API formatting.
 */
export async function sendExternalAgentMessage(
  messages: ExternalChatMessage[],
): Promise<string> {
  const config = getExternalAgentConfig();
  if (!config.apiKey) throw new Error("API key non configurata. Vai in Settings → Agente Esterno.");
  
  const model = getSelectedModel();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-agent-proxy`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages,
        model_id: model.id,
        provider: model.provider,
        api_key: config.apiKey,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`Errore ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.reply;
}

/**
 * External Agent Configuration & Chat
 * 
 * Supports OpenAI, Anthropic (Claude), and Google (Gemini) APIs
 * via Kael backend proxy (API key stored server-side for security).
 */

import { apiRequest } from "@/lib/api/client";

export type AgentProvider = "openai" | "anthropic" | "google";

export interface AgentModel {
  id: string;
  label: string;        // Short label shown in bubble e.g. "GPT-4o"
  provider: AgentProvider;
  providerLabel: string; // e.g. "OpenAI", "Anthropic", "Google"
}

export const AGENT_MODELS: AgentModel[] = [
  // OpenAI
  { id: "gpt-4.1", label: "GPT-4.1", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", providerLabel: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", providerLabel: "OpenAI" },
  { id: "o3", label: "o3", provider: "openai", providerLabel: "OpenAI" },
  { id: "o3-mini", label: "o3 Mini", provider: "openai", providerLabel: "OpenAI" },
  { id: "o4-mini", label: "o4 Mini", provider: "openai", providerLabel: "OpenAI" },
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
  modelId: string;
}

export function getExternalAgentConfig(): ExternalAgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { modelId: parsed.modelId || "gpt-4o" };
    }
  } catch {
    // Ignore malformed local preferences and fall back to the canonical model.
  }
  return { modelId: "gpt-4o" };
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

export interface ExternalAgentProvenance {
  provider: AgentProvider;
  agent_id: string;
  exchange_id: string;
  conversation_id: string;
  source_event_id: string;
  received_at: number;
  content_sha256: string;
  verification_method: string;
  transport_verified: true;
  claim_trust: "attributed_external_statement";
}

export interface ExternalAgentChatResponse {
  reply: string;
  turn_id: number;
  created: boolean;
  replayed: boolean;
  observation: {
    observation_id: string;
    observation_type: "external_agent_message";
    event_type: "message";
    provenance: ExternalAgentProvenance;
  };
}

export interface ExternalAgentExchangeIdentity {
  exchangeId: string;
  sessionId: string;
}

/**
 * Send a message to the external agent via Kael backend proxy.
 * The backend holds the API key securely — the APK never touches it.
 * If a system prompt is configured, it is prepended to the messages.
 */
export async function sendExternalAgentMessage(
  messages: ExternalChatMessage[],
  identity: ExternalAgentExchangeIdentity,
): Promise<ExternalAgentChatResponse> {
  const model = getSelectedModel();
  const systemPrompt = getSystemPrompt();

  // Build API messages with proper system role
  const apiMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))]
    : messages.map(m => ({ role: m.role, content: m.content }));

  return apiRequest<ExternalAgentChatResponse>("/services/external-agent/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: apiMessages,
      model_id: model.id,
      provider: model.provider,
      exchange_id: identity.exchangeId,
      session_id: identity.sessionId,
    }),
  });
}

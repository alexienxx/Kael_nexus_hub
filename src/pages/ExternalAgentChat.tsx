import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import KaelHeader from "@/components/layout/KaelHeader";
import ChatInput from "@/components/chat/ChatInput";
import AssistantMarkdown from "@/components/chat/AssistantMarkdown";
import TypingIndicator from "@/components/TypingIndicator";
import {
  getSelectedModel,
  getExternalAgentConfig,
  sendExternalAgentMessage,
  type ExternalChatMessage,
  type AgentModel,
} from "@/lib/externalAgent";
import { useTheme } from "@/lib/store/theme";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
  model?: AgentModel;
}

const now = () =>
  new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/** Colour per provider */
const providerColor: Record<string, string> = {
  openai: "rgba(16, 163, 127, 0.25)",
  anthropic: "rgba(204, 120, 50, 0.25)",
  google: "rgba(66, 133, 244, 0.25)",
};

const providerBorder: Record<string, string> = {
  openai: "rgba(16, 163, 127, 0.5)",
  anthropic: "rgba(204, 120, 50, 0.5)",
  google: "rgba(66, 133, 244, 0.5)",
};

const ExternalAgentChat = () => {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { theme } = useTheme();

  const scrollToBottom = () =>
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);

  const handleSend = useCallback(async (text: string) => {
    const config = getExternalAgentConfig();
    if (!config.apiKey) {
      toast.error("Configura l'API key in Settings → Agente Esterno");
      return;
    }

    const model = getSelectedModel();
    const userMsg: UIMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      time: now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

    setIsTyping(true);
    try {
      const history: ExternalChatMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ];
      const reply = await sendExternalAgentMessage(history);
      setIsTyping(false);

      const assistantMsg: UIMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        time: now(),
        model,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      scrollToBottom();
    } catch (err) {
      setIsTyping(false);
      toast.error(err instanceof Error ? err.message : "Errore nella risposta");
    }
  }, [messages]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <KaelHeader
        title="External Agent"
        showStatus={false}
        showBack
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-60 text-center px-8">
            <div className="h-14 w-14 rounded-full bg-accent/20 flex items-center justify-center mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Chatta con un agente AI esterno.
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-2">
              Configura la tua API key in Settings → Agente Esterno
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="mr-2 h-8 w-8 shrink-0 self-end rounded-full bg-accent/20 flex items-center justify-center text-xs">
                🤖
              </div>
            )}
            <div className="max-w-[75%] flex flex-col">
              <div
                className={`px-4 py-2.5 ${msg.role === "user" ? "backdrop-blur-sm" : ""}`}
                style={{
                  borderRadius:
                    msg.role === "user"
                      ? `${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px ${theme.bubbleRadius}px`
                      : `${theme.bubbleRadius}px ${theme.bubbleRadius}px ${theme.bubbleRadius}px 4px`,
                  background:
                    msg.role === "user"
                      ? `hsl(${theme.bubbleColorHue} 60% 45% / 0.7)`
                      : providerColor[msg.model?.provider || "openai"],
                  border:
                    msg.role === "assistant"
                      ? `1px solid ${providerBorder[msg.model?.provider || "openai"]}`
                      : "none",
                }}
              >
                {/* Model label inside bubble for assistant messages */}
                {msg.role === "assistant" && msg.model && (
                  <p className="text-[9px] font-medium text-white/70 uppercase tracking-wider mb-1">
                    {msg.model.providerLabel} · {msg.model.label}
                  </p>
                )}

                {msg.role === "user" ? (
                  <p className="text-sm leading-relaxed text-foreground">
                    {msg.content}
                  </p>
                ) : (
                  <AssistantMarkdown content={msg.content} />
                )}

                <div className={`mt-1 flex items-center ${msg.role === "user" ? "justify-end" : ""}`}>
                  <p className="text-[10px] text-foreground/40">{msg.time}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-end gap-2">
            <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-xs">
              🤖
            </div>
            <TypingIndicator />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <ChatInput onSend={handleSend} />
    </div>
  );
};

export default ExternalAgentChat;

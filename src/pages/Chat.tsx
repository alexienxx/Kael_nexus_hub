import { useState, useRef, useCallback, useEffect } from "react";
import { Phone, Plus } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { useSession } from "@/hooks/useSession";
import { useAgenticActions } from "@/hooks/useAgenticActions";
import { useBackendLifecycle } from "@/hooks/useBackendLifecycle";
import chatBg from "@/assets/chat-bg.jpg";
import KaelHeader from "@/components/layout/KaelHeader";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import ImageViewer from "@/components/media/ImageViewer";
import ServicesSheet from "@/components/services/ServicesSheet";
import ServiceActionChips from "@/components/services/ServiceActionChips";
import type { ChatMessage } from "@/types";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as chatApi from "@/lib/api/chat";
import { requestTTS } from "@/lib/api/voice";
import { getApiConfig, probeAndResolveBackend, invalidateBackendCache } from "@/lib/api/client";

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [showServicesSheet, setShowServicesSheet] = useState(false);
  const { theme, kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();
  const { activeContext, clearContext } = useAgenticActions();
  const { state: lifecycleState, message: lifecycleMessage } = useBackendLifecycle();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const historyLoadedRef = useRef(false);

  // Load real chat history from backend once lifecycle reaches "online"
  useEffect(() => {
    if (lifecycleState !== "online" || historyLoadedRef.current) {
      // Not yet online — keep showing loading (or skip if already loaded)
      if (lifecycleState !== "online" && lifecycleState !== "checking") {
        setHistoryLoading(false); // don't show spinner when clearly offline/starting
      }
      return;
    }
    historyLoadedRef.current = true;
    let cancelled = false;
    (async () => {
      // Backend is online — lifecycle already resolved the URL
      const config = getApiConfig();
      if (!config.baseUrl) {
        setHistoryLoading(false);
        return;
      }
      try {
        const data = await chatApi.getChatHistory(sessionId);
        if (!cancelled && data?.messages?.length) {
          setMessages(
            data.messages.map((m: any) => ({
              id: m.id ?? m.turn_id ?? String(Date.now() + Math.random()),
              text: m.text ?? m.content ?? "",
              time: m.time ?? new Date(m.timestamp ?? Date.now()).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
              sender: m.sender ?? (m.role === "user" ? "user" : "kael"),
              feedback: m.feedback ?? null,
              backend_turn_id: m.id ?? m.turn_id ?? m.backend_turn_id,
              audioUrl: m.tts_url ?? m.voice_audio ?? m.audioUrl,
              image: m.image,
              meta: m.meta,
              agent_id: m.agent_id,
              agent_name: m.agent_name,
              agent_avatar: m.agent_avatar,
            }))
          );
        }
      } catch (err) {
        console.warn("[Chat] History load failed (backend may be offline):", err);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [lifecycleState, sessionId]);

  const scrollToBottom = (instant?: boolean) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView(instant ? { behavior: "auto" } : { behavior: "smooth" });
    }, instant ? 30 : 100);
  };

  // Auto-scroll to bottom when history finishes loading
  useEffect(() => {
    if (!historyLoading && messages.length > 0) {
      scrollToBottom(true); // instant scroll on initial load
    }
  }, [historyLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        text,
        time: now(),
        sender: "user",
        feedback: null,
      };
      setMessages((prev) => [...prev, userMsg]);
      scrollToBottom();

      setIsTyping(true);
      try {
        const startTime = Date.now();
        const response = await chatApi.sendMessage(text, sessionId);
        const latency = Date.now() - startTime;

        setIsTyping(false);
        const responseMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: response.reply,
          time: now(),
          sender: response.sender || "kael", // Use backend sender, default to "kael"
          feedback: null,
          backend_turn_id: response.assistant_turn_id != null ? String(response.assistant_turn_id) : undefined,
          latency,
          meta: response.meta,
          audioUrl: response.voice_audio,
          // Preserve external agent metadata if present
          agent_id: response.agent_id,
          agent_name: response.agent_name,
          agent_avatar: response.agent_avatar,
        };
        setMessages((prev) => [...prev, responseMsg]);
        scrollToBottom();
      } catch (error) {
        setIsTyping(false);
        const errorMsg = error instanceof Error ? error.message : "Failed to send message";
        toast.error(errorMsg);
        console.error("Send message error:", error);

        // Backend may have gone away — invalidate cache and re-probe in background.
        // Next send will use the freshly-resolved URL (or show backend-unresolved).
        invalidateBackendCache();
        probeAndResolveBackend().then((url) => {
          if (url) {
            console.log("[Chat] Re-probe found live backend:", url);
          } else {
            console.warn("[Chat] Re-probe failed — all backends unreachable");
          }
        });
      }
    },
    [sessionId]
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const imgMsg: ChatMessage = {
          id: Date.now().toString(),
          text: "",
          time: now(),
          sender: "user",
          image: ev.target?.result as string,
          feedback: null,
        };
        setMessages((prev) => [...prev, imgMsg]);
        scrollToBottom();

        setIsTyping(true);
        try {
          const startTime = Date.now();
          const response = await chatApi.sendImage(file, sessionId);
          const latency = Date.now() - startTime;

          setIsTyping(false);
          const responseMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            text: response.reply,
            time: now(),
            sender: response.sender || "kael", // Use backend sender, default to "kael"
            feedback: null,
            backend_turn_id: response.assistant_turn_id,
            latency,
            meta: response.meta,
            audioUrl: response.voice_audio,
            // Preserve external agent metadata if present
            agent_id: response.agent_id,
            agent_name: response.agent_name,
            agent_avatar: response.agent_avatar,
          };
          setMessages((prev) => [...prev, responseMsg]);
          scrollToBottom();
        } catch (error) {
          setIsTyping(false);
          const errorMsg = error instanceof Error ? error.message : "Failed to send image";
          toast.error(errorMsg);
          console.error("Send image error:", error);
        }
      };
      reader.readAsDataURL(file);
    },
    [sessionId]
  );

  const handleVoiceNote = useCallback(
    async (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const voiceMsg: ChatMessage = {
        id: Date.now().toString(),
        text: "",
        time: now(),
        sender: "user",
        audioUrl: url,
        audioDuration: 0,
        feedback: null,
      };
      setMessages((prev) => [...prev, voiceMsg]);
      scrollToBottom();

      setIsTyping(true);
      try {
        const startTime = Date.now();
        const response = await chatApi.sendVoiceNote(blob, sessionId);
        const latency = Date.now() - startTime;

        setIsTyping(false);
        const responseMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: response.reply,
          time: now(),
          sender: response.sender || "kael", // Use backend sender, default to "kael"
          feedback: null,
          backend_turn_id: response.assistant_turn_id,
          latency,
          meta: response.meta,
          audioUrl: response.voice_audio,
          // Preserve external agent metadata if present
          agent_id: response.agent_id,
          agent_name: response.agent_name,
          agent_avatar: response.agent_avatar,
        };
        setMessages((prev) => [...prev, responseMsg]);
        scrollToBottom();
      } catch (error) {
        setIsTyping(false);
        const errorMsg = error instanceof Error ? error.message : "Failed to send voice note";
        toast.error(errorMsg);
        console.error("Send voice note error:", error);
      }
    },
    [sessionId]
  );

  const handleFeedback = useCallback(
    async (id: string, type: "like" | "dislike") => {
      const message = messages.find((m) => m.id === id);
      if (!message?.backend_turn_id) return;

      // Optimistic UI update
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, feedback: m.feedback === type ? null : type } : m
        )
      );

      try {
        await chatApi.submitFeedback(message.backend_turn_id, type);
      } catch (error) {
        // Revert on error
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, feedback: message.feedback } : m
          )
        );
        const errorMsg = error instanceof Error ? error.message : "Failed to submit feedback";
        toast.error(errorMsg);
        console.error("Submit feedback error:", error);
      }
    },
    [messages]
  );

  const handleRegenerate = useCallback(
    async (id: string) => {
      const message = messages.find((m) => m.id === id);
      if (!message?.backend_turn_id) return;

      setIsTyping(true);
      try {
        const startTime = Date.now();
        const response = await chatApi.regenerateResponse(message.backend_turn_id, sessionId);
        const latency = Date.now() - startTime;

        setIsTyping(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  text: response.reply,
                  sender: response.sender || m.sender, // Preserve or update sender
                  backend_turn_id: response.assistant_turn_id,
                  latency,
                  meta: response.meta,
                  audioUrl: response.voice_audio,
                  // Preserve external agent metadata if present
                  agent_id: response.agent_id,
                  agent_name: response.agent_name,
                  agent_avatar: response.agent_avatar,
                }
              : m
          )
        );
      } catch (error) {
        setIsTyping(false);
        const errorMsg = error instanceof Error ? error.message : "Failed to regenerate response";
        toast.error(errorMsg);
        console.error("Regenerate error:", error);
      }
    },
    [messages, sessionId]
  );

  const handlePlayTTS = useCallback(async (text: string) => {
    try {
      const audioBlob = await requestTTS(text);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to play TTS";
      toast.error(errorMsg);
      console.error("TTS error:", error);
    }
  }, []);

  const bgOpacity = theme.backgroundOpacity;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: theme.backgroundImage
            ? `url(${theme.backgroundImage})`
            : `url(${chatBg})`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, hsl(var(--background) / ${bgOpacity * 0.5}), hsl(var(--background) / ${bgOpacity}), hsl(var(--background) / ${bgOpacity * 1.5}))`,
        }}
      />

      {/* Header */}
      <KaelHeader
        title="Kael"
        lifecycleState={lifecycleState}
        lifecycleMessage={lifecycleMessage}
        rightContent={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowServicesSheet(true)}
              className="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 hover:text-neon-pink"
              aria-label="Open services"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => navigate("/calls")}
              className="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 hover:text-neon-purple"
              aria-label="Start call"
            >
              <Phone size={16} />
            </button>
          </div>
        }
      />

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Service Context Chips */}
        <ServiceActionChips context={activeContext} onRemove={clearContext} />

        {/* Loading state */}
        {historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-60">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-purple border-t-transparent mb-3" />
            <span className="text-xs text-muted-foreground">Caricamento conversazioni...</span>
          </div>
        )}

        {/* Empty state — no history, backend connected or not */}
        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-60 text-center px-8">
            <img src={kaelAvatarSrc} alt="Kael" className="h-16 w-16 rounded-full object-cover mb-4 opacity-70" />
            <p className="text-sm text-muted-foreground">Scrivi un messaggio per iniziare.</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onLike={(id) => handleFeedback(id, "like")}
            onDislike={(id) => handleFeedback(id, "dislike")}
            onRegenerate={handleRegenerate}
            onPlayTTS={handlePlayTTS}
            onImageClick={setViewerImage}
          />
        ))}

        {isTyping && (
          <div className="flex items-end gap-2">
            <img src={kaelAvatarSrc} alt="Kael" className="h-8 w-8 rounded-full object-cover" />
            <TypingIndicator />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onImageUpload={handleImageUpload}
        onVoiceNote={handleVoiceNote}
      />

      {/* Fullscreen Image Viewer */}
      {viewerImage && (
        <ImageViewer src={viewerImage} onClose={() => setViewerImage(null)} />
      )}

      {/* Services Sheet */}
      <ServicesSheet isOpen={showServicesSheet} onClose={() => setShowServicesSheet(false)} />
    </div>
  );
};

export default Chat;

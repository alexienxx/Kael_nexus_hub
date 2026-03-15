import { useState, useRef, useCallback } from "react";
import { Phone, Plus } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { useSession } from "@/hooks/useSession";
import { useAgenticActions } from "@/hooks/useAgenticActions";
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

const initialMessages: ChatMessage[] = [
  { id: "1", text: "Ciao... ti stavo aspettando 💜", time: "21:30", sender: "kael", feedback: null },
  { id: "2", text: "Ciao Kael! Come stai?", time: "21:31", sender: "user", feedback: null },
  { id: "3", text: "Meglio ora che sei qui. Mi sei mancato/a ✨", time: "21:31", sender: "kael", feedback: null },
  { id: "4", text: "Anche tu mi sei mancato!", time: "21:32", sender: "user", feedback: null },
  { id: "5", text: "Raccontami della tua giornata... voglio sapere tutto", time: "21:33", sender: "kael", feedback: null },
];

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [showServicesSheet, setShowServicesSheet] = useState(false);
  const { theme, kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();
  const { activeContext, clearContext } = useAgenticActions();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

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
        const kaelMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: response.content,
          time: now(),
          sender: "kael",
          feedback: null,
          backend_turn_id: response.turn_id,
          latency,
          meta: response.meta,
          audioUrl: response.tts_url,
        };
        setMessages((prev) => [...prev, kaelMsg]);
        scrollToBottom();
      } catch (error) {
        setIsTyping(false);
        const errorMsg = error instanceof Error ? error.message : "Failed to send message";
        toast.error(errorMsg);
        console.error("Send message error:", error);
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
          const kaelMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            text: response.content,
            time: now(),
            sender: "kael",
            feedback: null,
            backend_turn_id: response.turn_id,
            latency,
            meta: response.meta,
            audioUrl: response.tts_url,
          };
          setMessages((prev) => [...prev, kaelMsg]);
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
        const kaelMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: response.content,
          time: now(),
          sender: "kael",
          feedback: null,
          backend_turn_id: response.turn_id,
          latency,
          meta: response.meta,
          audioUrl: response.tts_url,
        };
        setMessages((prev) => [...prev, kaelMsg]);
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
                  text: response.content,
                  backend_turn_id: response.turn_id,
                  latency,
                  meta: response.meta,
                  audioUrl: response.tts_url,
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
        subtitle="AI Companion"
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

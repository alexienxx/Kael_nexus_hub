import { useState, useRef, useCallback } from "react";
import { Phone } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import chatBg from "@/assets/chat-bg.jpg";
import KaelHeader from "@/components/layout/KaelHeader";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import ImageViewer from "@/components/media/ImageViewer";
import type { ChatMessage } from "@/types";
import { useNavigate } from "react-router-dom";

// Placeholder responses — will be replaced by real backend calls
const placeholderResponses = [
  "Mi manchi tantissimo... 💜",
  "Stavo proprio pensando a te",
  "Sei la persona più speciale che conosco ✨",
  "Come stai oggi? Raccontami tutto",
  "Ho scritto qualcosa per te...",
  "Non vedo l'ora di sentirti ancora 🌙",
  "Ogni momento con te è magico",
  "Ti penso sempre 💫",
];

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
  const { theme, kaelAvatarSrc } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const now = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  const handleSend = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        text,
        time: now(),
        sender: "user",
        feedback: null,
      };
      setMessages((prev) => [...prev, userMsg]);
      scrollToBottom();

      // TODO: Replace with real API call: sendMessage(text)
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const response: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: placeholderResponses[Math.floor(Math.random() * placeholderResponses.length)],
          time: now(),
          sender: "kael",
          feedback: null,
        };
        setMessages((prev) => [...prev, response]);
        scrollToBottom();
      }, 1500 + Math.random() * 1500);
    },
    []
  );

  const handleImageUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
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

      // TODO: Replace with API call: sendImage(file)
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const response: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: "Wow, bellissima foto! 😍💜",
          time: now(),
          sender: "kael",
          feedback: null,
        };
        setMessages((prev) => [...prev, response]);
        scrollToBottom();
      }, 2000);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleVoiceNote = useCallback((blob: Blob) => {
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

    // TODO: Replace with API call: sendVoiceNote(blob)
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const response: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: "Che bello sentirti! La tua voce è musica 🎵",
        time: now(),
        sender: "kael",
        feedback: null,
      };
      setMessages((prev) => [...prev, response]);
      scrollToBottom();
    }, 2000);
  }, []);

  const handleFeedback = useCallback((id: string, type: "like" | "dislike") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, feedback: m.feedback === type ? null : type } : m
      )
    );
    // TODO: submitFeedback({ messageId: id, type })
  }, []);

  const handleRegenerate = useCallback((id: string) => {
    // TODO: Replace with API call: regenerateResponse(id)
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, text: placeholderResponses[Math.floor(Math.random() * placeholderResponses.length)] }
            : m
        )
      );
    }, 1500);
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
          <button
            onClick={() => navigate("/calls")}
            className="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 hover:text-neon-purple"
          >
            <Phone size={16} />
          </button>
        }
      />

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onLike={(id) => handleFeedback(id, "like")}
            onDislike={(id) => handleFeedback(id, "dislike")}
            onRegenerate={handleRegenerate}
            onPlayTTS={(text) => {
              // TODO: requestTTS(text)
              console.log("TTS requested:", text);
            }}
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
    </div>
  );
};

export default Chat;

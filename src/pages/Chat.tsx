import { useState, useRef, useCallback, useEffect } from "react";
import { Phone } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { useSession } from "@/hooks/useSession";
import { useAgenticActions } from "@/hooks/useAgenticActions";
import { useBackendLifecycle } from "@/hooks/useBackendLifecycle";
import { useChatWallpaper } from "@/hooks/useChatWallpaper";
import { useLongPress } from "@/hooks/useLongPress";
import chatBg from "@/assets/chat-bg.jpg";
import KaelHeader from "@/components/layout/KaelHeader";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import ImageViewer from "@/components/media/ImageViewer";

import ServiceActionChips from "@/components/services/ServiceActionChips";
import WallpaperLayer from "@/components/wallpaper/WallpaperLayer";
import WallpaperActionSheet from "@/components/wallpaper/WallpaperActionSheet";
import WallpaperPreviewSheet from "@/components/wallpaper/WallpaperPreviewSheet";
import WallpaperKaelModeSheet from "@/components/wallpaper/WallpaperKaelModeSheet";
import WallpaperDisplaySettingsSheet from "@/components/wallpaper/WallpaperDisplaySettingsSheet";
import type { ChatMessage } from "@/types";
import type { WallpaperDisplaySettings, WallpaperKaelMode } from "@/types/wallpaper";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as chatApi from "@/lib/api/chat";
import { requestTTS } from "@/lib/api/voice";
import { getApiConfig, probeAndResolveBackend, invalidateBackendCache } from "@/lib/api/client";

// Default conversation ID for the main Kael chat
const DEFAULT_CONVERSATION_ID = "kael-main";

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  
  const { theme, kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();
  const { activeContext, clearContext } = useAgenticActions();
  const { state: lifecycleState, message: lifecycleMessage } = useBackendLifecycle();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const historyLoadedRef = useRef(false);
  const wallpaperFileRef = useRef<HTMLInputElement>(null);

  // Wallpaper state
  const {
    wallpaper,
    setWallpaper,
    updateDisplaySettings,
    removeWallpaper: removeWallpaperFromStore,
    resetDisplaySettings,
    hasWallpaper,
  } = useChatWallpaper(DEFAULT_CONVERSATION_ID);

  // Wallpaper UI flow states
  const [showWallpaperActions, setShowWallpaperActions] = useState(false);
  const [showWallpaperPreview, setShowWallpaperPreview] = useState(false);
  const [showKaelModeSheet, setShowKaelModeSheet] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [pendingWallpaperUri, setPendingWallpaperUri] = useState<string | null>(null);
  const [pendingDisplaySettings, setPendingDisplaySettings] = useState<Partial<WallpaperDisplaySettings> | null>(null);

  // Long press on background
  const longPressHandlers = useLongPress({
    onLongPress: () => setShowWallpaperActions(true),
    delay: 600,
  });

  // Wallpaper flow handlers
  const handleChangeWallpaper = useCallback(() => {
    wallpaperFileRef.current?.click();
  }, []);

  const handleWallpaperFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const uri = ev.target?.result as string;
      if (uri) {
        setPendingWallpaperUri(uri);
        setShowWallpaperPreview(true);
      }
    };
    reader.onerror = () => {
      toast.error("Impossibile leggere l'immagine");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const handlePreviewConfirm = useCallback((settings: Partial<WallpaperDisplaySettings>) => {
    setPendingDisplaySettings(settings);
    setShowWallpaperPreview(false);
    // Open Kael mode selection
    setShowKaelModeSheet(true);
  }, []);

  const handleKaelModeSelected = useCallback((mode: WallpaperKaelMode) => {
    if (!pendingWallpaperUri) return;
    setWallpaper(pendingWallpaperUri, mode, pendingDisplaySettings ?? undefined);
    setPendingWallpaperUri(null);
    setPendingDisplaySettings(null);

    // Show appropriate toast
    const modeMessages: Record<WallpaperKaelMode, string> = {
      wallpaper_only: "Sfondo aggiornato ✨",
      share_once: "Sfondo condiviso con Kael 📸",
      persistent_context: "Contesto visivo attivo aggiornato 👁️",
    };
    toast.success(modeMessages[mode]);
  }, [pendingWallpaperUri, pendingDisplaySettings, setWallpaper]);

  const handleRemoveWallpaper = useCallback(() => {
    removeWallpaperFromStore();
    toast.success("Sfondo rimosso");
  }, [removeWallpaperFromStore]);

  // Load real chat history from backend once lifecycle reaches "online"
  useEffect(() => {
    if (lifecycleState !== "online" || historyLoadedRef.current) {
      if (lifecycleState !== "online" && lifecycleState !== "checking") {
        setHistoryLoading(false);
      }
      return;
    }
    historyLoadedRef.current = true;
    let cancelled = false;
    (async () => {
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
        console.warn("[Chat] History load failed:", err);
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

  useEffect(() => {
    if (!historyLoading && messages.length > 0) {
      scrollToBottom(true);
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
          sender: response.sender || "kael",
          feedback: null,
          backend_turn_id: response.assistant_turn_id != null ? String(response.assistant_turn_id) : undefined,
          latency,
          meta: response.meta,
          audioUrl: response.voice_audio,
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
        invalidateBackendCache();
        probeAndResolveBackend().catch(() => {});
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
            sender: response.sender || "kael",
            feedback: null,
            backend_turn_id: response.assistant_turn_id != null ? String(response.assistant_turn_id) : undefined,
            latency,
            meta: response.meta,
            audioUrl: response.voice_audio,
            agent_id: response.agent_id,
            agent_name: response.agent_name,
            agent_avatar: response.agent_avatar,
          };
          setMessages((prev) => [...prev, responseMsg]);
          scrollToBottom();
        } catch (error) {
          setIsTyping(false);
          toast.error(error instanceof Error ? error.message : "Failed to send image");
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
          sender: response.sender || "kael",
          feedback: null,
          backend_turn_id: response.assistant_turn_id != null ? String(response.assistant_turn_id) : undefined,
          latency,
          meta: response.meta,
          audioUrl: response.voice_audio,
          agent_id: response.agent_id,
          agent_name: response.agent_name,
          agent_avatar: response.agent_avatar,
        };
        setMessages((prev) => [...prev, responseMsg]);
        scrollToBottom();
      } catch (error) {
        setIsTyping(false);
        toast.error(error instanceof Error ? error.message : "Failed to send voice note");
      }
    },
    [sessionId]
  );

  const handleFeedback = useCallback(
    async (id: string, type: "like" | "dislike") => {
      const message = messages.find((m) => m.id === id);
      if (!message?.backend_turn_id) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, feedback: m.feedback === type ? null : type } : m
        )
      );

      try {
        await chatApi.submitFeedback(message.backend_turn_id, type);
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, feedback: message.feedback } : m)
        );
        toast.error(error instanceof Error ? error.message : "Failed to submit feedback");
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
                  sender: response.sender || m.sender,
                  backend_turn_id: response.assistant_turn_id != null ? String(response.assistant_turn_id) : undefined,
                  latency,
                  meta: response.meta,
                  audioUrl: response.voice_audio,
                  agent_id: response.agent_id,
                  agent_name: response.agent_name,
                  agent_avatar: response.agent_avatar,
                }
              : m
          )
        );
      } catch (error) {
        setIsTyping(false);
        toast.error(error instanceof Error ? error.message : "Failed to regenerate response");
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
      toast.error(error instanceof Error ? error.message : "Failed to play TTS");
    }
  }, []);

  // Bubble wallpaper style props
  const bubbleWallpaperStyle = wallpaper?.displaySettings ?? null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Wallpaper Layer — dedicated subsystem, separate from message images */}
      <WallpaperLayer
        wallpaper={wallpaper}
        fallbackBg={theme.backgroundImage || chatBg}
        themeOpacity={theme.backgroundOpacity}
      />

      {/* Header */}
      <KaelHeader
        title="Kael"
        lifecycleState={lifecycleState}
        lifecycleMessage={lifecycleMessage}
        rightContent={
          <button
              onClick={() => navigate("/calls")}
              className="glass flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-110 hover:text-neon-purple"
              aria-label="Start call"
            >
              <Phone size={16} />
            </button>
        }
      />

      {/* Messages — long press on background triggers wallpaper menu */}
      <div
        className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3"
        {...longPressHandlers}
        style={{ touchAction: "pan-y" }}
      >
        <ServiceActionChips context={activeContext} onRemove={clearContext} />

        {historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-60">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-purple border-t-transparent mb-3" />
            <span className="text-xs text-muted-foreground">Caricamento conversazioni...</span>
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-60 text-center px-8">
            <img src={kaelAvatarSrc} alt="Kael" className="h-16 w-16 rounded-full object-cover mb-4 opacity-70" />
            <p className="text-sm text-muted-foreground">Scrivi un messaggio per iniziare.</p>
            <p className="text-[10px] text-muted-foreground/50 mt-2">Tieni premuto sullo sfondo per personalizzarlo</p>
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
            wallpaperStyle={bubbleWallpaperStyle}
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

      {/* Hidden wallpaper file input */}
      <input
        ref={wallpaperFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleWallpaperFileSelected}
      />

      {/* Fullscreen Image Viewer */}
      {viewerImage && (
        <ImageViewer src={viewerImage} onClose={() => setViewerImage(null)} />
      )}

      {/* Services Sheet */}
      <ServicesSheet isOpen={showServicesSheet} onClose={() => setShowServicesSheet(false)} />

      {/* Wallpaper Action Sheet */}
      <WallpaperActionSheet
        open={showWallpaperActions}
        onClose={() => setShowWallpaperActions(false)}
        hasWallpaper={hasWallpaper}
        onChangeWallpaper={handleChangeWallpaper}
        onRemoveWallpaper={handleRemoveWallpaper}
        onOpenDisplaySettings={() => setShowDisplaySettings(true)}
      />

      {/* Wallpaper Preview */}
      {pendingWallpaperUri && (
        <WallpaperPreviewSheet
          open={showWallpaperPreview}
          onClose={() => { setShowWallpaperPreview(false); setPendingWallpaperUri(null); }}
          imageUri={pendingWallpaperUri}
          onConfirm={handlePreviewConfirm}
        />
      )}

      {/* Kael Mode Selection */}
      <WallpaperKaelModeSheet
        open={showKaelModeSheet}
        onClose={() => { setShowKaelModeSheet(false); setPendingWallpaperUri(null); }}
        onSelect={handleKaelModeSelected}
      />

      {/* Display Settings */}
      {wallpaper && (
        <WallpaperDisplaySettingsSheet
          open={showDisplaySettings}
          onClose={() => setShowDisplaySettings(false)}
          settings={wallpaper.displaySettings}
          onUpdate={updateDisplaySettings}
          onReset={resetDisplaySettings}
        />
      )}
    </div>
  );
};

export default Chat;

import { useState, useRef, useEffect } from "react";
import { Send, Image, Mic, Square, Camera, Plug, X } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onImageUpload?: (file: File) => void;
  onVoiceNote?: (blob: Blob) => void;
  onOpenServices?: () => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, onImageUpload, onVoiceNote, onOpenServices, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for edit-message events from long-press
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (text) {
        setInput(text);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };
    window.addEventListener("kael-edit-message", handler);
    return () => window.removeEventListener("kael-edit-message", handler);
  }, []);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageUpload(file);
    e.target.value = "";
    setShowMediaMenu(false);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onVoiceNote?.(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  return (
    <div className="glass-strong relative z-10 px-4 py-3">
      {/* Media menu popup */}
      {showMediaMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMediaMenu(false)} />
          <div className="absolute bottom-full left-3 mb-2 z-50 glass-strong rounded-2xl p-2 min-w-[180px] shadow-xl shadow-black/30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={() => { photoInputRef.current?.click(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
            >
              <Image size={18} className="text-neon-purple" />
              <span>Foto dalla galleria</span>
            </button>
            <button
              onClick={() => { cameraInputRef.current?.click(); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
            >
              <Camera size={18} className="text-neon-blue" />
              <span>Scatta foto</span>
            </button>
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        {/* Photo/camera button with mini-menu */}
        <button
          onClick={() => setShowMediaMenu(!showMediaMenu)}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 ${
            showMediaMenu ? "text-neon-purple" : "text-muted-foreground hover:text-neon-purple"
          }`}
        >
          {showMediaMenu ? <X size={20} /> : <Image size={20} />}
        </button>

        {/* Hidden file inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="glass flex flex-1 items-center rounded-full px-4 py-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Scrivi a Kael..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            disabled={disabled}
          />
        </div>

        <button
          onClick={toggleRecording}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 ${
            isRecording
              ? "bg-destructive/20 text-destructive animate-pulse"
              : "text-muted-foreground hover:text-neon-pink"
          }`}
        >
          {isRecording ? <Square size={16} /> : <Mic size={20} />}
        </button>

        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple to-accent text-primary-foreground shadow-lg shadow-neon-purple/30 transition-all hover:scale-110 active:scale-95 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;

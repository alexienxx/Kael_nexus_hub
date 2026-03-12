import { useState, useRef } from "react";
import { Send, Image, Mic, Square, Camera } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onImageUpload: (file: File) => void;
  onVoiceNote?: (blob: Blob) => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, onImageUpload, onVoiceNote, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageUpload(file);
    e.target.value = "";
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
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-neon-purple hover:scale-110"
        >
          <Image size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="glass flex flex-1 items-center rounded-full px-4 py-2">
          <input
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

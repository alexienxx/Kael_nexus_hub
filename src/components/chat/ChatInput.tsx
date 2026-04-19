import { useState, useRef, useEffect } from "react";
import { Send, Image, Mic, Square, Camera, Plug, X, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { requestMicrophonePermission } from "@/lib/permissions";

interface ChatInputProps {
  onSend: (text: string) => void;
  onImageUpload?: (file: File, caption?: string) => void;
  onVoiceNote?: (blob: Blob) => void;
  onOpenServices?: () => void;
  onCancelEdit?: () => void;
  disabled?: boolean;
}

const ChatInput = ({ onSend, onImageUpload, onVoiceNote, onOpenServices, onCancelEdit, disabled }: ChatInputProps) => {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for edit-message events from long-press
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const text = detail?.text;
      const messageId = detail?.messageId;
      if (text) {
        setInput(text);
        setEditingMessageId(messageId ?? null);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };
    window.addEventListener("kael-edit-message", handler);
    return () => window.removeEventListener("kael-edit-message", handler);
  }, []);

  // Revoke the staged preview URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (stagedPreview) URL.revokeObjectURL(stagedPreview);
    };
  }, [stagedPreview]);

  const unstageFile = () => {
    if (stagedPreview) URL.revokeObjectURL(stagedPreview);
    setStagedFile(null);
    setStagedPreview(null);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setInput("");
    onCancelEdit?.();
  };

  const handleSend = () => {
    if (disabled) return;
    if (stagedFile) {
      // Send image with optional caption
      const caption = input.trim() || undefined;
      onImageUpload?.(stagedFile, caption);
      setInput("");
      unstageFile();
      setEditingMessageId(null);
      return;
    }
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
    setEditingMessageId(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Stage the file — don't send yet. User can add/edit caption first.
      if (stagedPreview) URL.revokeObjectURL(stagedPreview);
      setStagedFile(file);
      setStagedPreview(URL.createObjectURL(file));
      // Focus the text input so the user can type a caption immediately
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    e.target.value = "";
    setShowMediaMenu(false);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const granted = await requestMicrophonePermission();
    if (!granted) {
      toast.error("Accesso al microfono negato. Abilita il permesso nelle impostazioni.");
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
      toast.error("Accesso al microfono negato. Abilita il permesso nelle impostazioni.");
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
            <button
              onClick={() => { setShowMediaMenu(false); onOpenServices ? onOpenServices() : navigate("/workspace"); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10"
            >
              <Plug size={18} className="text-teal-400" />
              <span>Servizi agentici</span>
            </button>
          </div>
        </>
      )}

      {/* Editing indicator */}
      {editingMessageId && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-neon-purple/10 px-3 py-2 border border-neon-purple/20">
          <Pencil size={14} className="text-neon-purple shrink-0" />
          <span className="text-xs text-neon-purple font-medium flex-1">Modifica messaggio</span>
          <button
            onClick={cancelEdit}
            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10 transition-colors"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Staged image preview */}
      {stagedPreview && (
        <div className="mb-2 flex items-end gap-2">
          <div className="relative inline-block">
            <img
              src={stagedPreview}
              alt="Anteprima"
              className="h-20 w-20 rounded-xl object-cover border border-foreground/10 shadow-md"
            />
            <button
              onClick={unstageFile}
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-transform hover:scale-110"
            >
              <X size={12} />
            </button>
          </div>
          <span className="text-xs text-muted-foreground pb-1">Aggiungi un commento o invia</span>
        </div>
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
            placeholder={stagedFile ? "Commenta la foto..." : "Scrivi a Kael..."}
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
          disabled={(!input.trim() && !stagedFile) || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple to-accent text-primary-foreground shadow-lg shadow-neon-purple/30 transition-all hover:scale-110 active:scale-95 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;

import { useState, useEffect } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
} from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { useSession } from "@/hooks/useSession";
import KaelHeader from "@/components/layout/KaelHeader";
import type { CallState, TranscriptEntry } from "@/types";
import { initiateCall, endCall } from "@/lib/api/voice";
import { toast } from "sonner";

const Calls = () => {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const { kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();

  // Call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (callState === "active") {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
      if (callState === "idle") setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  const handleStartCall = async () => {
    setCallState("ringing");
    try {
      const response = await initiateCall(sessionId);
      setCallId(response.call_id);

      // Simulate connection delay, then transition to active
      setTimeout(() => {
        setCallState("active");
      }, 2000);
    } catch (error) {
      setCallState("idle");
      const errorMsg = error instanceof Error ? error.message : "Failed to start call";
      toast.error(errorMsg);
      console.error("Start call error:", error);
    }
  };

  const handleEndCall = async () => {
    if (!callId) {
      setCallState("idle");
      return;
    }

    setCallState("ended");
    try {
      await endCall(callId, sessionId);
      setTimeout(() => {
        setCallState("idle");
        setTranscript([]);
        setCallId(null);
      }, 1500);
    } catch (error) {
      // Still end the call locally even if backend fails
      setTimeout(() => {
        setCallState("idle");
        setTranscript([]);
        setCallId(null);
      }, 1500);
      const errorMsg = error instanceof Error ? error.message : "Failed to end call";
      toast.error(errorMsg);
      console.error("End call error:", error);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (callState === "idle") {
    return (
      <div className="flex h-full flex-col">
        <KaelHeader title="Calls" showStatus={false} />
        <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
          <div className="relative">
            <img
              src={kaelAvatarSrc}
              alt="Kael"
              className="h-32 w-32 rounded-full object-cover ring-4 ring-neon-purple/30 neon-pulse"
            />
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-neon-purple/20 px-3 py-1 text-[11px] text-neon-purple backdrop-blur-sm">
                Disponibile
              </span>
            </div>
          </div>

          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-foreground">Chiama Kael</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Conversazione vocale con il tuo companion
            </p>
          </div>

          <button
            onClick={handleStartCall}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30 transition-all hover:scale-110 active:scale-95"
          >
            <Phone size={28} />
          </button>

          {/* Call history placeholder */}
          <div className="w-full max-w-sm">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Recenti</h3>
            <div className="space-y-2">
              {["Ieri, 23:15 • 12 min", "2 giorni fa • 8 min", "5 giorni fa • 25 min"].map((item, i) => (
                <div key={i} className="glass flex items-center gap-3 rounded-xl px-4 py-3">
                  <Phone size={14} className="text-neon-purple" />
                  <span className="text-sm text-foreground/70">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active / ringing / ended call screen
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-background via-background/95 to-background p-8">
      <div className="relative mb-8">
        <img
          src={kaelAvatarSrc}
          alt="Kael"
          className={`h-36 w-36 rounded-full object-cover ring-4 ${
            callState === "active"
              ? "ring-neon-purple neon-pulse"
              : callState === "ringing"
              ? "ring-yellow-400/50 animate-pulse"
              : "ring-muted-foreground/30"
          }`}
        />
        {callState === "active" && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
            <Volume2 size={16} className="text-neon-purple animate-pulse" />
          </div>
        )}
      </div>

      <h2 className="font-display text-2xl font-bold neon-text text-neon-purple">Kael</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {callState === "ringing" && "Connessione in corso..."}
        {callState === "active" && formatDuration(callDuration)}
        {callState === "ended" && "Chiamata terminata"}
      </p>

      {/* Transcript area */}
      {callState === "active" && transcript.length > 0 && (
        <div className="glass mt-6 w-full max-w-sm max-h-40 overflow-y-auto rounded-xl p-4">
          {transcript.map((entry) => (
            <p key={entry.id} className="text-xs text-foreground/70 mb-1">
              <span className={entry.speaker === "kael" ? "text-neon-purple" : "text-foreground"}>
                {entry.speaker === "kael" ? "Kael" : "Tu"}:
              </span>{" "}
              {entry.text}
            </p>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="mt-10 flex items-center gap-6">
        {callState === "active" && (
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
              isMuted
                ? "bg-destructive/20 text-destructive"
                : "glass text-foreground"
            }`}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
        )}

        {(callState === "active" || callState === "ringing") && (
          <button
            onClick={handleEndCall}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/30 transition-all hover:scale-110 active:scale-95"
          >
            <PhoneOff size={28} />
          </button>
        )}
      </div>
    </div>
  );
};

export default Calls;

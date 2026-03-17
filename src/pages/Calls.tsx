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
import { useCapability } from "@/hooks/useCapability";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import KaelHeader from "@/components/layout/KaelHeader";
import type { CallState, TranscriptEntry } from "@/types";
import { initiateCall, endCall, getActiveCall } from "@/lib/api/voice";
import { toast } from "sonner";

const Calls = () => {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const { kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();

  // Check if call capability is available (backend reachable)
  const callCapability = useCapability(
    () => getActiveCall(sessionId),
    {
      isEmpty: (data) => !data.call,
    }
  );

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
      setTimeout(() => setCallState("active"), 2000);
    } catch (error) {
      setCallState("idle");
      const errorMsg = error instanceof Error ? error.message : "Impossibile avviare la chiamata";
      toast.error(errorMsg);
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Errore nel terminare la chiamata";
      toast.error(errorMsg);
    } finally {
      setTimeout(() => {
        setCallState("idle");
        setTranscript([]);
        setCallId(null);
      }, 1500);
    }
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Backend unavailable — show capability state
  const backendUnavailable =
    callCapability.state === "unavailable" || callCapability.state === "pending";

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
              <span
                className={`rounded-full px-3 py-1 text-[11px] backdrop-blur-sm ${
                  backendUnavailable
                    ? "bg-muted text-muted-foreground"
                    : "bg-neon-purple/20 text-neon-purple"
                }`}
              >
                {backendUnavailable ? "Non disponibile" : "Disponibile"}
              </span>
            </div>
          </div>

          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-foreground">Chiama Kael</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {backendUnavailable
                ? "Connetti il backend per abilitare le chiamate"
                : "Conversazione vocale con il tuo companion"}
            </p>
          </div>

          <button
            onClick={handleStartCall}
            disabled={backendUnavailable}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30 transition-all hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
          >
            <Phone size={28} />
          </button>
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

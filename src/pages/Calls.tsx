/**
 * VIDEOCALL PAGE â€” Kael Nexus Hub
 *
 * Source of truth: kael_refactor/tests/source_of_truth-apk_kael_nexus_hub.py
 *
 * Architecture:
 *   - User webcam: getUserMedia({ video: true, audio: true }) â†’ <video> element
 *   - Kael face: MJPEG stream from /avatar/live/stream â†’ <img> element
 *     (native browser MJPEG support, no JS decoding needed)
 *     Fallback: static avatar photo if stream unavailable or KAEL_AVATAR_ENABLED=0
 *   - Call state: POST /mobile/call/start â†’ POST /mobile/call/end
 *   - Avatar stream: POST /avatar/live/stream/start â†’ stop on end
 *
 * MJPEG + Auth note:
 *   The MJPEG stream is loaded as an <img src> tag. Browsers don't send
 *   Authorization headers for img src. If the backend blocks unauthenticated
 *   access to /avatar/live/stream, the img will fail to load â†’ static avatar
 *   is shown as fallback. This is acceptable behavior.
 *
 * NO video message request button exists here.
 * Video messages are triggered by natural language: "mandami un video", etc.
 * This page is VIDEOCALL ONLY.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PhoneOff, Mic, MicOff, CameraOff, Camera } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { useSession } from "@/hooks/useSession";
import { useCapability } from "@/hooks/useCapability";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import KaelHeader from "@/components/layout/KaelHeader";
import type { CallState, TranscriptEntry } from "@/types";
import { initiateCall, endCall, getActiveCall, sendCallVoiceMessage } from "@/lib/api/voice";
import { startAvatarStream, stopAvatarStream, getAvatarStreamUrl } from "@/lib/api/avatar";
import { toast } from "sonner";

const Calls = () => {
  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [avatarStreamUrl, setAvatarStreamUrl] = useState<string | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  /** Non-null when audio loop encounters backend errors during an active call. */
  const [audioError, setAudioError] = useState<string | null>(null);

  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Audio-during-call loop refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isMutedRef = useRef(false);          // shadow of isMuted for use inside async callbacks
  const isProcessingRef = useRef(false);     // prevent concurrent audio sends
  const callActiveRef = useRef(false);       // tracks whether the audio loop should continue
  /** Consecutive audio-turn failures. Reset to 0 on any successful turn. */
  const audioErrorCountRef = useRef(0);

  const { kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();

  // Keep isMutedRef in sync so audio-loop callbacks read the live value
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const callCapability = useCapability(
    () => getActiveCall(sessionId),
    { isEmpty: (data) => !data.call }
  );

  // Call duration timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (callState === "active") {
      interval = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    } else {
      if (callState === "idle") setCallDuration(0);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [callState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      callActiveRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      stopAvatarStream().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: true,
      });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
      setWebcamError(null);
    } catch (err) {
      setWebcamError(err instanceof Error ? err.message : "Webcam non disponibile");
      // Don't block the call if webcam unavailable
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  const toggleCam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = isCamOff; });
    }
    setIsCamOff((prev) => !prev);
  }, [isCamOff]);

  /**
   * startAudioLoop — begins a continuous 4-second audio capture cycle.
   *
   * Uses MediaRecorder.start(4000) so ondataavailable fires every 4 s.
   * Each chunk is sent to POST /mobile/call/voice (STT→LLM→TTS).
   * The reply audio is played immediately; transcript is updated.
   * Muted chunks are silently discarded. Concurrent sends are serialised
   * via isProcessingRef (skips chunk rather than queuing).
   */
  const startAudioLoop = useCallback(
    (stream: MediaStream, activeCallId: string) => {
      if (!stream.getAudioTracks().length) return;

      callActiveRef.current = true;
      isProcessingRef.current = false;

      // Pick the best supported mime type
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", ""].find(
        (t) => !t || MediaRecorder.isTypeSupported(t),
      ) ?? "";

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = async (e) => {
        // Discard if: no data, muted, already processing, or call ended
        if (!e.data.size || isMutedRef.current || isProcessingRef.current || !callActiveRef.current) return;

        isProcessingRef.current = true;
        try {
          // Convert blob → base64
          const arr = await e.data.arrayBuffer();
          const bytes = new Uint8Array(arr);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);

          const result = await sendCallVoiceMessage(activeCallId, b64, sessionId);

          // Populate transcript
          const now = new Date().toISOString();
          const entries: TranscriptEntry[] = [];
          if (result.transcription?.trim()) {
            entries.push({ id: `u-${Date.now()}`, speaker: "user", text: result.transcription, timestamp: now });
          }
          if (result.reply?.trim()) {
            entries.push({ id: `k-${Date.now() + 1}`, speaker: "kael", text: result.reply, timestamp: now });
          }
          if (entries.length) setTranscript((prev) => [...prev, ...entries]);

          // Play audio reply
          if (result.reply_audio_base64) {
            try {
              const audio = new Audio(`data:audio/wav;base64,${result.reply_audio_base64}`);
              await audio.play();
            } catch { /* auto-play policy — silently ignore */ }
          }

          // Successful turn: reset consecutive error count and clear error banner.
          audioErrorCountRef.current = 0;
          setAudioError(null);
        } catch (err) {
          console.warn("[Calls] Audio turn error:", err);
          audioErrorCountRef.current++;

          if (audioErrorCountRef.current === 3) {
            // 3 consecutive failures → show degraded-audio warning banner.
            setAudioError("Connessione audio instabile");
          }

          if (audioErrorCountRef.current >= 5) {
            // 5 consecutive failures → backend is unreachable; terminate loop.
            stopAudioLoop();
            setCallState("ended");
            toast.error("Chiamata terminata: connessione al backend persa");
          }
        } finally {
          isProcessingRef.current = false;
        }
      };

      // Fire ondataavailable every 4 seconds
      mr.start(4000);
    },
    [sessionId],
  );

  /** stopAudioLoop — tears down the MediaRecorder cleanly. */
  const stopAudioLoop = useCallback(() => {
    callActiveRef.current = false;
    isProcessingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
  }, []);

  const handleStartCall = useCallback(async () => {
    setCallState("ringing");   // show "Connessione in corso..." immediately
    try {
      const response = await initiateCall(sessionId);
      setCallId(response.call_id);

      // Start Kael's MJPEG avatar stream (best-effort)
      try {
        await startAvatarStream("neutral");
        setAvatarStreamUrl(getAvatarStreamUrl());
      } catch {
        setAvatarStreamUrl(null); // fallback to static photo
      }

      // Start user webcam (best-effort)
      await startWebcam();

      const capturedCallId = response.call_id;
      // Transition to active: brief delay lets audio/webcam settle,
      // then immediately start the audio loop so no audio is lost.
      setTimeout(() => {
        setCallState("active");
        if (webcamStreamRef.current && capturedCallId) {
          startAudioLoop(webcamStreamRef.current, capturedCallId);
        }
      }, 800);
    } catch (error) {
      setCallState("idle");
      stopWebcam();
      toast.error(error instanceof Error ? error.message : "Impossibile avviare la videochiamata");
    }
  }, [sessionId, startWebcam, stopWebcam, startAudioLoop]);

  const handleEndCall = useCallback(async () => {
    setCallState("ended");
    stopAudioLoop();        // stop audio capture before tearing down the stream
    stopWebcam();
    stopAvatarStream().catch(() => {});
    setAvatarStreamUrl(null);

    if (callId) {
      try { await endCall(callId, sessionId); } catch { /* best-effort */ }
    }

    setTimeout(() => {
      setCallState("idle");
      setTranscript([]);
      setCallId(null);
      setIsMuted(false);
      setIsCamOff(false);
      audioErrorCountRef.current = 0;
      setAudioError(null);
    }, 1500);
  }, [callId, sessionId, stopWebcam, stopAudioLoop]);

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const backendUnavailable =
    callCapability.state === "unavailable" || callCapability.state === "pending";

  // â”€â”€ IDLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (callState === "idle") {
    return (
      <div className="flex h-full flex-col">
        <KaelHeader title="Videochiamata" showStatus={false} />
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
                ? "Connetti il backend per abilitare la videochiamata"
                : "Videochiamata â€” Kael ti vedrÃ  tramite la tua webcam"}
            </p>
            {webcamError && (
              <p className="mt-1 text-xs text-yellow-500">Webcam: {webcamError}</p>
            )}
          </div>

          {/* Video call button â€” ONLY button on this page */}
          <CapabilityGuard capability={callCapability}>
            <button
              onClick={handleStartCall}
              disabled={backendUnavailable}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple to-violet-600 text-white shadow-lg shadow-neon-purple/30 transition-all hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
            >
              <Camera size={28} />
            </button>
          </CapabilityGuard>
        </div>
      </div>
    );
  }

  // â”€â”€ ACTIVE / RINGING / ENDED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="flex h-full flex-col bg-black">
      {/* Kael's face â€” fills top area */}
      <div className="relative flex-1 overflow-hidden">
        {avatarStreamUrl ? (
          <img
            src={avatarStreamUrl}
            alt="Kael"
            className="h-full w-full object-cover"
            onError={() => setAvatarStreamUrl(null)}
          />
        ) : (
          <img
            src={kaelAvatarSrc}
            alt="Kael"
            className={`h-full w-full object-cover ${callState === "active" ? "opacity-90" : "opacity-50"}`}
          />
        )}

        {/* Status overlay */}
        <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1 pt-8">
          <h2 className="font-display text-xl font-bold text-white drop-shadow-lg">Kael</h2>
          <p className="text-sm text-white/70">
            {callState === "ringing" && "Connessione in corso..."}
            {callState === "active" && formatDuration(callDuration)}
            {callState === "ended" && "Videochiamata terminata"}
          </p>
        </div>

        {/* User webcam â€” picture-in-picture top-right */}
        <div className="absolute right-4 top-4 h-28 w-20 overflow-hidden rounded-xl border border-white/20 bg-black shadow-lg">
          {isCamOff || webcamError ? (
            <div className="flex h-full w-full items-center justify-center bg-zinc-900">
              <CameraOff size={20} className="text-white/40" />
            </div>
          ) : (
            <video
              ref={webcamVideoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover scale-x-[-1]"
            />
          )}
        </div>

        {/* Transcript overlay */}
        {callState === "active" && transcript.length > 0 && (
          <div className="absolute inset-x-4 bottom-28 max-h-32 overflow-y-auto rounded-xl bg-black/60 p-3 backdrop-blur-sm">
            {transcript.map((entry) => (
              <p key={entry.id} className="mb-0.5 text-xs text-white/80">
                <span className={entry.speaker === "kael" ? "text-neon-purple" : "text-white"}>
                  {entry.speaker === "kael" ? "Kael" : "Tu"}:
                </span>{" "}
                {entry.text}
              </p>
            ))}
          </div>
        )}

        {/* Audio error banner — shown when backend fails during an active call */}
        {callState === "active" && audioError && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl bg-destructive/80 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">
            ⚠ {audioError}
          </div>
        )}
      </div>

      {/* Controls */}
      {(callState === "active" || callState === "ringing") && (
        <div className="flex items-center justify-center gap-6 bg-black/80 py-6 backdrop-blur-sm">
          {callState === "active" && (
            <>
              <button
                onClick={toggleMute}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
                  isMuted ? "bg-destructive/80 text-white" : "bg-white/10 text-white"
                }`}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <button
                onClick={toggleCam}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
                  isCamOff ? "bg-destructive/80 text-white" : "bg-white/10 text-white"
                }`}
              >
                {isCamOff ? <CameraOff size={22} /> : <Camera size={22} />}
              </button>
            </>
          )}
          <button
            onClick={handleEndCall}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-white shadow-lg shadow-destructive/40 transition-all hover:scale-105 active:scale-95"
          >
            <PhoneOff size={26} />
          </button>
        </div>
      )}
    </div>
  );
};

export default Calls;

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
 *   - Call state: /audio/calls lifecycle owned by the canonical AudioRuntime
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
import { useLocation, useNavigate } from "react-router-dom";
import { PhoneOff, Mic, MicOff, CameraOff, Camera } from "lucide-react";
import { useTheme } from "@/lib/store/theme-context";
import { useSession } from "@/hooks/useSession";
import { useCapability } from "@/hooks/useCapability";
import CapabilityGuard from "@/components/common/CapabilityGuard";
import KaelHeader from "@/components/layout/KaelHeader";
import type { CallSession, CallState } from "@/types";
import {
  answerCall,
  dismissCall,
  endCall,
  getActiveCall,
  getIncomingCall,
  initiateCall,
  sendCanonicalCallTurn,
} from "@/lib/api/voice";
import { nativeCallVoiceService } from "@/lib/audio/nativeCallVoiceService";
import { observeSustainedRms } from "@/lib/audio/sustainedRms";
import { startAvatarStream, stopAvatarStream } from "@/lib/api/avatar";
import { toast } from "sonner";

const Calls = () => {
  type CallPhase = "listening" | "thinking" | "speaking";
  const [callState, setCallState] = useState<CallState>("idle");
  const [callPhase, setCallPhase] = useState<CallPhase>("listening");
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [avatarStreamUrl, setAvatarStreamUrl] = useState<string | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  /** Non-null when audio loop encounters backend errors during an active call. */
  const [audioError, setAudioError] = useState<string | null>(null);

  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // One finalized utterance is sent at a time. No partial transcript is ever
  // rendered or committed by this client.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const endpointContextRef = useRef<AudioContext | null>(null);
  const endpointSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const endpointAnalyserRef = useRef<AnalyserNode | null>(null);
  const endpointFrameRef = useRef<number | null>(null);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callAttemptRef = useRef(0);
  const activeCallAttemptRef = useRef<number | null>(null);
  const callPhaseRef = useRef<CallPhase>("listening");
  const startListeningRef = useRef<(stream: MediaStream, activeCallId: string) => void>(() => {});
  const isMutedRef = useRef(false);          // shadow of isMuted for use inside async callbacks
  const callActiveRef = useRef(false);       // tracks whether the audio loop should continue
  /** Consecutive audio-turn failures. Reset to 0 on any successful turn. */
  const audioErrorCountRef = useRef(0);

  const { kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  // Keep isMutedRef in sync so audio-loop callbacks read the live value
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { callPhaseRef.current = callPhase; }, [callPhase]);

  const callCapability = useCapability(
    () => getActiveCall(sessionId)
  );

  // Incoming-call polling observes server-owned lifecycle only. It never
  // decides that Arrakis should call and is active only while this page is idle.
  useEffect(() => {
    if (callState !== "idle" || !sessionId.trim()) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await getIncomingCall(sessionId);
        if (!cancelled) setIncomingCall(result.call?.status === "ringing" ? result.call : null);
      } catch {
        if (!cancelled) setIncomingCall(null);
      }
    };
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [callState, sessionId]);

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
      callAttemptRef.current++;
      if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
      if (endedResetTimerRef.current) clearTimeout(endedResetTimerRef.current);
      callActiveRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (endpointFrameRef.current != null) cancelAnimationFrame(endpointFrameRef.current);
      endpointSourceRef.current?.disconnect();
      endpointAnalyserRef.current?.disconnect();
      void endpointContextRef.current?.close();
      void nativeCallVoiceService.stop();
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      stopAvatarStream().catch(() => {});
    };
  }, []);

  const startWebcam = useCallback(async (attempt: number): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (callAttemptRef.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
      setWebcamError(null);
      return true;
    } catch (err) {
      if (callAttemptRef.current !== attempt) return false;
      setWebcamError(err instanceof Error ? err.message : "Webcam non disponibile");
      // Don't block the call if webcam unavailable
      return true;
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

  const closeEndpointing = useCallback(() => {
    if (endpointFrameRef.current != null) cancelAnimationFrame(endpointFrameRef.current);
    endpointFrameRef.current = null;
    endpointSourceRef.current?.disconnect();
    endpointSourceRef.current = null;
    endpointAnalyserRef.current?.disconnect();
    endpointAnalyserRef.current = null;
    const context = endpointContextRef.current;
    endpointContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const toggleMute = useCallback(() => {
    const stream = webcamStreamRef.current;
    if (!stream) return;
    if (!isMuted) {
      isMutedRef.current = true;
      if (mediaRecorderRef.current?.state === "recording") {
        try { mediaRecorderRef.current.stop(); } catch { /* already stopping */ }
      }
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });
      closeEndpointing();
    } else {
      isMutedRef.current = false;
      stream.getAudioTracks().forEach((track) => { track.enabled = true; });
      if (callActiveRef.current && callId) startListeningRef.current(stream, callId);
    }
    setIsMuted((prev) => !prev);
  }, [callId, closeEndpointing, isMuted]);

  const handleMicControl = useCallback(async () => {
    if (callPhaseRef.current === "speaking" && callId && webcamStreamRef.current) {
      const stream = webcamStreamRef.current;
      const attempt = activeCallAttemptRef.current;
      await nativeCallVoiceService.stop();
      if (
        !callActiveRef.current || attempt == null ||
        activeCallAttemptRef.current !== attempt || webcamStreamRef.current !== stream
      ) return;
      stream.getAudioTracks().forEach((track) => { track.enabled = true; });
      setIsMuted(false);
      startListeningRef.current(stream, callId);
      return;
    }
    if (callPhaseRef.current === "thinking") return;
    toggleMute();
  }, [callId, toggleMute]);

  const toggleCam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = isCamOff; });
    }
    setIsCamOff((prev) => !prev);
  }, [isCamOff]);

  /** Stop capture before releasing the camera/microphone stream. */
  const stopAudioLoop = useCallback(() => {
    callActiveRef.current = false;
    activeCallAttemptRef.current = null;
    closeEndpointing();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
  }, [closeEndpointing]);

  const releaseCallMedia = useCallback((): Promise<void> => {
    callAttemptRef.current++;
    if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
    activationTimerRef.current = null;
    setCallState("ended");
    stopAudioLoop();
    const stopPlayback = nativeCallVoiceService.stop();
    stopWebcam();
    void stopAvatarStream().catch(() => {});
    setAvatarStreamUrl(null);
    return stopPlayback;
  }, [stopAudioLoop, stopWebcam]);

  const scheduleIdleReset = useCallback(() => {
    if (endedResetTimerRef.current) clearTimeout(endedResetTimerRef.current);
    endedResetTimerRef.current = setTimeout(() => {
      endedResetTimerRef.current = null;
      setCallState("idle");
      setCallId(null);
      setCallPhase("listening");
      setIsMuted(false);
      setIsCamOff(false);
      audioErrorCountRef.current = 0;
      setAudioError(null);
    }, 1500);
  }, []);

  /**
   * Observe microphone energy while Arrakis is speaking so the user can barge
   * in without touching the screen. Browser AEC/NS/AGC remain the acoustic
   * owner; this detector uses only a sustained RMS threshold and never infers
   * words, emotion or intent.
   */
  const startBargeInDetection = useCallback((
    stream: MediaStream,
    onBargeIn: () => void,
  ): boolean => {
    if (!stream.getAudioTracks().some((track) => track.enabled)) return false;
    closeEndpointing();
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;
    try {
      context = new AudioContext({ latencyHint: "interactive" });
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
    } catch {
      if (context && context.state !== "closed") void context.close();
      console.warn("[Calls] AUDIO_BARGE_IN_ANALYSER_UNAVAILABLE");
      return false;
    }
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.15;
    source.connect(analyser);
    endpointContextRef.current = context;
    endpointSourceRef.current = source;
    endpointAnalyserRef.current = analyser;

    const samples = new Float32Array(analyser.fftSize);
    let aboveThresholdSince: number | null = null;
    let fired = false;
    const monitor = () => {
      if (fired || !callActiveRef.current) return;
      analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / samples.length);
      const now = performance.now();
      const observation = observeSustainedRms(aboveThresholdSince, rms, now, 0.04, 180);
      aboveThresholdSince = observation.aboveThresholdSince;
      if (observation.triggered) {
        fired = true;
        onBargeIn();
        return;
      }
      endpointFrameRef.current = requestAnimationFrame(monitor);
    };
    void context.resume().catch(() => {
      if (endpointContextRef.current !== context) return;
      console.warn("[Calls] AUDIO_BARGE_IN_ANALYSER_UNAVAILABLE");
      closeEndpointing();
    });
    endpointFrameRef.current = requestAnimationFrame(monitor);
    return true;
  }, [closeEndpointing]);

  /**
   * Commit one finalized utterance to the same Arrakis ingress used by chat,
   * then present the committed assistant turn through the native PCM runtime.
   */
  const processUtterance = useCallback(async (
    audio: Blob,
    activeCallId: string,
    attempt: number,
  ) => {
    if (
      !callActiveRef.current || isMutedRef.current ||
      activeCallAttemptRef.current !== attempt
    ) return;
    setCallPhase("thinking");
    try {
      const result = await sendCanonicalCallTurn(audio, sessionId, activeCallId);
      if (!callActiveRef.current || activeCallAttemptRef.current !== attempt) return;
      setCallPhase("speaking");
      let bargeInTriggered = false;
      const playback = nativeCallVoiceService.playAssistantTurn(
        result.assistantTurnId, sessionId, activeCallId,
      );
      if (webcamStreamRef.current) {
        startBargeInDetection(webcamStreamRef.current, () => {
          if (
            bargeInTriggered || !callActiveRef.current ||
            activeCallAttemptRef.current !== attempt
          ) return;
          bargeInTriggered = true;
          void nativeCallVoiceService.stop().finally(() => {
            if (
              callActiveRef.current && activeCallAttemptRef.current === attempt &&
              webcamStreamRef.current
            ) {
              startListeningRef.current(webcamStreamRef.current, activeCallId);
            }
          });
        });
      }
      await playback;
      audioErrorCountRef.current = 0;
      setAudioError(null);
      if (
        !bargeInTriggered && callActiveRef.current &&
        activeCallAttemptRef.current === attempt && webcamStreamRef.current
      ) {
        startListeningRef.current(webcamStreamRef.current, activeCallId);
      }
    } catch {
      if (!callActiveRef.current || activeCallAttemptRef.current !== attempt) return;
      console.warn("[Calls] AUDIO_CALL_TURN_FAILED");
      audioErrorCountRef.current++;
      if (audioErrorCountRef.current >= 3) setAudioError("Connessione audio instabile");
      if (audioErrorCountRef.current >= 5) {
        await releaseCallMedia().catch(() => {});
        await endCall(activeCallId, sessionId).catch(() => {});
        scheduleIdleReset();
        toast.error("Chiamata terminata: trasporto vocale non disponibile");
      } else if (callActiveRef.current && webcamStreamRef.current) {
        startListeningRef.current(webcamStreamRef.current, activeCallId);
      }
    }
  }, [releaseCallMedia, scheduleIdleReset, sessionId, startBargeInDetection]);

  /**
   * Capture one utterance. Endpointing observes local amplitude only; it does
   * not infer meaning or emotion. A final Blob is kept in RAM and discarded
   * after the canonical request.
   */
  const startAudioLoop = useCallback(
    (stream: MediaStream, activeCallId: string) => {
      if (!stream.getAudioTracks().length) return;
      const attempt = activeCallAttemptRef.current;
      if (attempt == null) return;
      callActiveRef.current = true;
      if (isMutedRef.current) return;
      if (mediaRecorderRef.current?.state === "recording") return;
      closeEndpointing();
      setCallPhase("listening");

      let mr: MediaRecorder;
      try {
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", ""].find(
          (t) => !t || MediaRecorder.isTypeSupported(t),
        ) ?? "";
        mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        setAudioError("Acquisizione microfono non disponibile");
        return;
      }
      const chunks: Blob[] = [];
      let shouldSubmit = false;
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      mr.onstop = () => {
        // A stopped recorder may deliver this event after mute/unmute has
        // already installed its successor. Only the owning recorder may touch
        // shared endpointing and listening state.
        if (mediaRecorderRef.current !== mr) return;
        mediaRecorderRef.current = null;
        closeEndpointing();
        if (
          !shouldSubmit || !callActiveRef.current || isMutedRef.current ||
          activeCallAttemptRef.current !== attempt
        ) {
          if (
            callActiveRef.current && !isMutedRef.current &&
            activeCallAttemptRef.current === attempt && webcamStreamRef.current
          ) {
            startListeningRef.current(webcamStreamRef.current, activeCallId);
          }
          return;
        }
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (blob.size) void processUtterance(blob, activeCallId, attempt);
      };
      mr.onerror = () => {
        if (mediaRecorderRef.current !== mr) return;
        mediaRecorderRef.current = null;
        closeEndpointing();
        setAudioError("Acquisizione microfono interrotta");
      };

      let context: AudioContext | null = null;
      let source: MediaStreamAudioSourceNode;
      let analyser: AnalyserNode;
      try {
        context = new AudioContext({ latencyHint: "interactive" });
        source = context.createMediaStreamSource(stream);
        analyser = context.createAnalyser();
      } catch {
        if (context && context.state !== "closed") void context.close();
        mediaRecorderRef.current = null;
        setAudioError("Analisi microfono non disponibile");
        return;
      }
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      endpointContextRef.current = context;
      endpointSourceRef.current = source;
      endpointAnalyserRef.current = analyser;

      const samples = new Float32Array(analyser.fftSize);
      const startedAt = performance.now();
      let speechDetected = false;
      let lastSpeechAt = startedAt;
      const monitor = () => {
        if (mr.state !== "recording" || !callActiveRef.current) return;
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length);
        const now = performance.now();
        if (rms >= 0.022) {
          speechDetected = true;
          lastSpeechAt = now;
        }
        const endedBySilence = speechDetected && now - lastSpeechAt >= 900;
        const hitDurationLimit = now - startedAt >= 45_000;
        if (endedBySilence || hitDurationLimit) {
          shouldSubmit = speechDetected;
          mr.stop();
          return;
        }
        endpointFrameRef.current = requestAnimationFrame(monitor);
      };
      void context.resume().catch(() => {
        if (mediaRecorderRef.current !== mr || endpointContextRef.current !== context) return;
        mediaRecorderRef.current = null;
        closeEndpointing();
        if (mr.state === "recording") {
          try { mr.stop(); } catch { /* already stopping */ }
        }
        setAudioError("Analisi microfono non disponibile");
      });
      try {
        mr.start(250);
      } catch {
        mediaRecorderRef.current = null;
        closeEndpointing();
        setAudioError("Acquisizione microfono non disponibile");
        return;
      }
      endpointFrameRef.current = requestAnimationFrame(monitor);
    },
    [closeEndpointing, processUtterance],
  );
  startListeningRef.current = startAudioLoop;

  const activateMedia = useCallback(async (activeCallId: string, attempt: number) => {
    activeCallAttemptRef.current = attempt;
    setCallId(activeCallId);
    try {
      const avatarStream = await startAvatarStream("neutral");
      if (callAttemptRef.current !== attempt) {
        // The avatar endpoint is process-global. A newer attempt may already
        // own it, so only a fully cancelled call may issue the compensating stop.
        if (activeCallAttemptRef.current == null) {
          await stopAvatarStream().catch(() => {});
        }
        return false;
      }
      setAvatarStreamUrl(avatarStream.stream_url ?? null);
    } catch {
      if (callAttemptRef.current !== attempt) return false;
      setAvatarStreamUrl(null);
    }
    if (!await startWebcam(attempt) || callAttemptRef.current !== attempt) return false;
    activationTimerRef.current = setTimeout(() => {
      activationTimerRef.current = null;
      if (callAttemptRef.current !== attempt) return;
      setCallState("active");
      if (webcamStreamRef.current) startAudioLoop(webcamStreamRef.current, activeCallId);
    }, 800);
    return true;
  }, [startAudioLoop, startWebcam]);

  const handleStartCall = useCallback(async () => {
    const attempt = ++callAttemptRef.current;
    setCallState("ringing");   // show "Connessione in corso..." immediately
    try {
      const response = await initiateCall(sessionId);
      if (callAttemptRef.current !== attempt || !await activateMedia(response.call_id, attempt)) {
        await endCall(response.call_id, sessionId).catch(() => {});
      }
    } catch (error) {
      setCallState("idle");
      stopWebcam();
      toast.error(error instanceof Error ? error.message : "Impossibile avviare la videochiamata");
    }
  }, [activateMedia, sessionId, stopWebcam]);

  const answerIncoming = useCallback(async (incomingCallId: string) => {
    const attempt = ++callAttemptRef.current;
    setCallState("ringing");
    try {
      const response = await answerCall(incomingCallId, sessionId);
      setIncomingCall(null);
      if (callAttemptRef.current !== attempt || !await activateMedia(response.call_id, attempt)) {
        await endCall(response.call_id, sessionId).catch(() => {});
      }
    } catch (error) {
      setCallState("idle");
      toast.error(error instanceof Error ? error.message : "Impossibile rispondere alla chiamata");
    }
  }, [activateMedia, sessionId]);

  const handleAnswerIncoming = useCallback(async () => {
    if (!incomingCall) return;
    await answerIncoming(incomingCall.call_id);
  }, [answerIncoming, incomingCall]);

  // AppShell hands off only the opaque registry call id. Consume the route
  // state once, then answer through the same canonical endpoint used here.
  useEffect(() => {
    const navigationState = location.state as { answerIncomingCallId?: unknown } | null;
    const incomingCallId = navigationState?.answerIncomingCallId;
    if (typeof incomingCallId !== "string" || !incomingCallId.trim()) return;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    void answerIncoming(incomingCallId);
  }, [answerIncoming, location.pathname, location.search, location.state, navigate]);

  const handleDismissIncoming = useCallback(async () => {
    if (!incomingCall) return;
    try {
      await dismissCall(incomingCall.call_id, sessionId);
      setIncomingCall(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile rifiutare la chiamata");
    }
  }, [incomingCall, sessionId]);

  const handleEndCall = useCallback(async () => {
    const endingCallId = callId;
    await releaseCallMedia();

    if (endingCallId) {
      try { await endCall(endingCallId, sessionId); } catch { /* best-effort */ }
    }

    scheduleIdleReset();
  }, [callId, releaseCallMedia, scheduleIdleReset, sessionId]);

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
              alt="Arrakis"
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
            <h2 className="font-display text-2xl font-bold text-foreground">
              {incomingCall ? "Arrakis ti sta chiamando" : "Chiama Arrakis"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {backendUnavailable
                ? "Connetti il backend per abilitare la videochiamata"
                : incomingCall
                  ? "Rispondi oppure rifiuta la chiamata"
                  : "Videochiamata — Arrakis ti vedrà attraverso la videocamera"}
            </p>
            {webcamError && (
              <p className="mt-1 text-xs text-yellow-500">Webcam: {webcamError}</p>
            )}
          </div>

          <CapabilityGuard state={callCapability.state}>
            {incomingCall ? (
              <div className="flex items-center gap-6">
                <button
                  onClick={handleDismissIncoming}
                  aria-label="Rifiuta chiamata"
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-white shadow-lg shadow-destructive/30 transition-all active:scale-95"
                >
                  <PhoneOff size={27} />
                </button>
                <button
                  onClick={handleAnswerIncoming}
                  aria-label="Rispondi alla chiamata"
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                >
                  <Camera size={27} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartCall}
                disabled={backendUnavailable}
                aria-label="Avvia videochiamata"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple to-violet-600 text-white shadow-lg shadow-neon-purple/30 transition-all hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
              >
                <Camera size={28} />
              </button>
            )}
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
            alt="Arrakis"
            className="h-full w-full object-cover"
            onError={() => setAvatarStreamUrl(null)}
          />
        ) : (
          <img
            src={kaelAvatarSrc}
            alt="Arrakis"
            className={`h-full w-full object-cover ${callState === "active" ? "opacity-90" : "opacity-50"}`}
          />
        )}

        {/* Status overlay */}
        <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1 pt-8">
          <h2 className="font-display text-xl font-bold text-white drop-shadow-lg">Arrakis</h2>
          <p className="text-sm text-white/70">
            {callState === "ringing" && "Connessione in corso..."}
            {callState === "active" && `${formatDuration(callDuration)} · ${
              callPhase === "listening"
                ? (isMuted ? "Microfono disattivato" : "Ti ascolto")
                : callPhase === "thinking" ? "Arrakis sta pensando" : "Arrakis sta parlando"
            }`}
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
                onClick={handleMicControl}
                disabled={callPhase === "thinking"}
                aria-label={callPhase === "speaking" ? "Interrompi Arrakis e parla" : (isMuted ? "Attiva microfono" : "Disattiva microfono")}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
                  isMuted ? "bg-destructive/80 text-white" : "bg-white/10 text-white"
                } disabled:opacity-40`}
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

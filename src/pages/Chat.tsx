import { useState, useRef, useCallback, useEffect } from "react";
import { Phone } from "lucide-react";
import { useTheme } from "@/lib/store/theme";
import { useSession } from "@/hooks/useSession";
import { useAgenticActions } from "@/hooks/useAgenticActions";
import { useBackendConnection } from "@/context/BackendConnectionContext";
import { useServiceHealthToast } from "@/hooks/useServiceHealthToast";
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
import type { KaelSSENewMessage } from "@/hooks/useKaelSSE";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as chatApi from "@/lib/api/chat";
import { requestTTS } from "@/lib/api/voice";
import { fetchAvatarVideo, getVideoJobStatus } from "@/lib/api/avatar";
import { emitTelemetry } from "@/lib/telemetry/sseTelemetry";
import {
  mergeMessagesIdempotent,
  normalizeAfterTs,
  resolveAssistantIdentity,
  resolveHistoryMessageId,
} from "@/lib/chat/reliability";
import { applyDiagnosticMarkers } from "@/lib/chat/diagnosticMarkers";

/** Poll avatar render job until done, then fetch the base64 video. */
const pollAndFetchAvatarVideo = async (jobId: string): Promise<string | null> => {
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLLS = 30; // 60s max
  for (let i = 0; i < MAX_POLLS; i++) {
    try {
      const status = await getVideoJobStatus(jobId);
      if (status.status === "done") {
        const result = await fetchAvatarVideo(jobId);
        return result?.video_base64
          ? `data:video/mp4;base64,${result.video_base64}`
          : null;
      }
      if (status.status === "error") return null;
    } catch {
      // transient network error — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null; // timeout
};
import { getApiConfig, probeAndResolveBackend } from "@/lib/api/client";
import { getGalleryFileUrl } from "@/lib/api/media";
import { sendExternalAgentMessage, getSelectedModel, type ExternalChatMessage } from "@/lib/externalAgent";

/**
 * Normalize voice_audio: backend returns raw base64 (no prefix).
 * AudioMessage needs a playable URL (data URI or http).
 */
function normalizeAudioUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("data:") || raw.startsWith("http")) return raw;
  return `data:audio/wav;base64,${raw}`;
}

// Default conversation ID for the main Kael chat
const DEFAULT_CONVERSATION_ID = "kael-main";

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState(false);
  const { theme, kaelAvatarSrc } = useTheme();
  const { sessionId } = useSession();
  const { activeContext, clearContext } = useAgenticActions();
  const { state: lifecycleState, message: lifecycleMessage } = useBackendConnection();
  useServiceHealthToast(lifecycleState);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const historyLoadedRef = useRef(false);
  const pendingDrainReadyRef = useRef(false);
  const wallpaperFileRef = useRef<HTMLInputElement>(null);

  /**
   * Watermark: Unix timestamp (seconds) of last known state.
   * Set after history load; used by SSE handler to fetch only newer messages.
   * Starts at 0 (sentinel) — SSE handler skips if history hasn't loaded yet.
   */
  const lastFetchTsRef = useRef<number>(0);

  /**
   * BUG-UI-DUP fix (2026-05-06): mutex for fetchAndAppendPending.
   * Three concurrent triggers can fire simultaneously after backend restart
   * + APK foreground (visibilitychange, kael-sse-connected, kael-server-restarted).
   * Without serialization they all read the same `after_ts` and the resulting
   * sort can show duplicated/mixed last messages. We hold the in-flight Promise
   * here; concurrent callers await the same Promise and do NOT issue a second
   * network request. mergeHistoryIntoState dedup invariants stay unchanged.
   */
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const lastPendingFetchStartedAtRef = useRef<number>(0);
  const lastRestartMergeBootIdRef = useRef<string | null>(null);

  const getMaxTimestamp = useCallback((items: any[]): number => {
    return items
      .map((m: any) =>
        typeof m?.timestamp === "number"
          ? m.timestamp
          : typeof m?.ts === "number"
            ? m.ts
            : 0
      )
      .filter((n: number) => Number.isFinite(n) && n > 0)
      .reduce((max: number, n: number) => (n > max ? n : max), 0);
  }, []);

  const normalizeAssistantPayload = useCallback(
    (rawText: string | null | undefined, meta?: Record<string, unknown>) =>
      applyDiagnosticMarkers(rawText ?? "", meta),
    [],
  );

  // Wallpaper state
  const {
    wallpaper,
    setWallpaper,
    updateDisplaySettings,
    updateSyncStatus,
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
  const [pendingWallpaperFile, setPendingWallpaperFile] = useState<File | null>(null);
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

    setPendingWallpaperFile(file);
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

    // Backend sync: send image if Kael should see it
    if (mode !== "wallpaper_only" && pendingWallpaperFile) {
      updateSyncStatus("pending_upload");
      chatApi
        .sendWallpaper(pendingWallpaperFile, sessionId, mode as "share_once" | "persistent_context")
        .then(() => {
          updateSyncStatus("uploaded");
          toast.success(modeMessages[mode]);
        })
        .catch((err) => {
          console.error("[Wallpaper] backend sync failed:", err);
          updateSyncStatus("failed");
          toast.error("Sfondo impostato localmente, ma sync con Kael fallita");
        });
    } else {
      toast.success(modeMessages[mode]);
    }

    setPendingWallpaperFile(null);
  }, [pendingWallpaperUri, pendingWallpaperFile, pendingDisplaySettings, setWallpaper, sessionId, updateSyncStatus]);

  const handleRemoveWallpaper = useCallback(() => {
    removeWallpaperFromStore();
    toast.success("Sfondo rimosso");
  }, [removeWallpaperFromStore]);

  // Helper: convert backend message object to local ChatMessage
  const mapBackendMsg = useCallback((m: any): ChatMessage => {
    // Resolve image: prefer inline data URL, then resolve asset ID to backend URL.
    // "__asset__:ID" placeholders are replaced with the actual /media/gallery/{id}/file URL
    // so images load correctly after reload without needing a local cache.
    let imageUrl: string | undefined = m.image;
    if (!imageUrl && m.image_asset_id) {
      imageUrl = getGalleryFileUrl(m.image_asset_id);
    } else if (imageUrl?.startsWith("__asset__:")) {
      const assetId = imageUrl.slice("__asset__:".length);
      imageUrl = getGalleryFileUrl(assetId);
    }

    const normalizedTs =
      typeof m.timestamp === "number"
        ? m.timestamp
        : typeof m.ts === "number"
          ? m.ts
          : Date.now() / 1000;
    const sender = (m.sender ?? (m.role === "user" ? "user" : "kael")) as ChatMessage["sender"];
    const rawText = m.text ?? m.content ?? "";
    const rawMeta = (m.meta ?? m.metadata ?? undefined) as Record<string, unknown> | undefined;
    const normalizedMessage =
      sender === "user"
        ? { text: rawText, meta: rawMeta }
        : normalizeAssistantPayload(rawText, rawMeta);

    return {
      id: resolveHistoryMessageId(m, sessionId),
      text: normalizedMessage.text,
      time: m.time ?? new Date((m.timestamp != null ? m.timestamp * 1000 : Date.now())).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      timestamp: normalizedTs,
      sender,
      feedback: m.feedback ?? null,
      backend_turn_id: m.id != null
        ? String(m.id)
        : m.turn_id != null
          ? String(m.turn_id)
          : m.backend_turn_id != null
            ? String(m.backend_turn_id)
            : undefined,
      // client_message_id is hoisted from meta_json by the backend history endpoint.
      // Present on user turns where the frontend sent a client_message_id at send time.
      client_message_id: m.client_message_id ?? m.metadata?.client_message_id ?? undefined,
      // Voice fallback chain (priority order):
      //   1. tts_url        — persistent URL backed by WAV on disk (chat path, survives reload)
      //   2. voice_audio    — ephemeral base64 (live POST /chat response only)
      //   3. voice_asset_id — future-ready (autonomous voice notes via asset store; not active today)
      //   4. audioUrl       — legacy/local fallback
      audioUrl: normalizeAudioUrl(m.tts_url ?? m.voice_audio ?? m.voice_asset_id ?? m.audioUrl),
      image: imageUrl,
      meta: normalizedMessage.meta,
      delivery_mode: m.delivery_mode ?? (m.message_type === "voice_note" ? "voice_note" : undefined),
      agent_id: m.agent_id,
      agent_name: m.agent_name,
      agent_avatar: m.agent_avatar,
    };
  }, [normalizeAssistantPayload, sessionId]);

  // Merge backend history into local state without losing local-only messages.
  //
  // Reconciliation order (no text-based heuristics):
  //   1. backend_turn_id  — for Kael messages and fully-persisted user turns
  //   2. client_message_id — for optimistic user messages whose backend_turn_id
  //      is not yet known locally (race between response ACK and history reload)
  //   3. No match → message is local-only (in-flight or not yet ACKed)
  //
  // This eliminates the optimistic-duplicate problem at the architectural level:
  // when history reload returns a user turn that the client sent with a known
  // client_message_id, the optimistic local copy is merged into the backend
  // record rather than appended as a separate entry.
  const mergeHistoryIntoState = useCallback((backendMessages: any[]) => {
    const incoming = backendMessages.map(mapBackendMsg);
    setMessages((prev) => {
      if (prev.length === 0) return incoming;

      // Index incoming by both reconciliation keys.
      const incomingByBackendTurnId = new Map(
        incoming.filter((m) => m.backend_turn_id).map((m) => [m.backend_turn_id, m])
      );
      const incomingByClientMsgId = new Map(
        incoming.filter((m) => m.client_message_id).map((m) => [m.client_message_id, m])
      );
      const incomingByStableId = new Set(incoming.map((m) => m.id));

      // Preserve feedback and local image data URLs keyed by backend_turn_id.
      const existingFeedback = new Map(
        prev.filter((m) => m.backend_turn_id && m.feedback).map((m) => [m.backend_turn_id, m.feedback])
      );
      const existingImages = new Map(
        prev
          .filter((m) => m.backend_turn_id && m.image && !m.image.startsWith("__asset__"))
          .map((m) => [m.backend_turn_id, m.image])
      );

      const merged = incoming.map((m) => {
        const fb = existingFeedback.get(m.backend_turn_id);
        const localImg = existingImages.get(m.backend_turn_id);
        let result = fb ? { ...m, feedback: fb } : m;
        if (localImg && (!m.image || m.image.startsWith("__asset__"))) {
          result = { ...result, image: localImg };
        }
        return result;
      });

      // Local-only: messages that don't match any incoming record by either key.
      // An optimistic user message that now has a backend_turn_id (ACKed before
      // this reload) or a matching client_message_id is already in `merged`
      // and must NOT be appended again.
      const localOnly = prev.filter((m) => {
        if (m.backend_turn_id && incomingByBackendTurnId.has(m.backend_turn_id)) return false;
        if (m.client_message_id && incomingByClientMsgId.has(m.client_message_id)) return false;
        if (incomingByStableId.has(m.id)) return false;
        return true;
      });

      const combined = [...merged, ...localOnly];
      combined.sort((a, b) => {
        const aId = a.backend_turn_id ? Number(a.backend_turn_id) : NaN;
        const bId = b.backend_turn_id ? Number(b.backend_turn_id) : NaN;
        if (!isNaN(aId) && !isNaN(bId) && aId !== bId) return aId - bId;
        const aTs = typeof a.timestamp === "number" ? a.timestamp : 0;
        const bTs = typeof b.timestamp === "number" ? b.timestamp : 0;
        if (!isNaN(aTs) && !isNaN(bTs) && aTs !== bTs) return aTs - bTs;
        if (!isNaN(aId)) return -1;
        if (!isNaN(bId)) return 1;
        return 0;
      });
      return combined;
    });
  }, [mapBackendMsg]);

  // Load real chat history from backend once lifecycle reaches "online".
  // Uses merge strategy: existing local messages are preserved, not replaced.
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
      let historyMessages: any[] = [];
      let historyLoadedOk = false;
      const config = getApiConfig();
      if (!config.baseUrl) {
        setHistoryLoading(false);
        return;
      }
      try {
        const data = await chatApi.getChatHistory(sessionId);
        historyMessages = data?.messages ?? [];
        if (!cancelled && data?.messages?.length) {
          mergeHistoryIntoState(data.messages);
        }
        historyLoadedOk = true;
      } catch (err) {
        console.warn("[Chat] History load failed:", err);
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
          if (historyLoadedOk) {
            pendingDrainReadyRef.current = true;
            // Advance watermark ONLY from confirmed backend data.
            // Never fallback to Date.now() here: a failed/empty load must not
            // skip pending messages that still need to be drained.
            const maxHistoryTs = getMaxTimestamp(historyMessages);
            if (maxHistoryTs > 0) {
              lastFetchTsRef.current = maxHistoryTs;
            }
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [lifecycleState, sessionId, mergeHistoryIntoState, getMaxTimestamp]);

  const scrollToBottom = useCallback((instant?: boolean) => {
    const doScroll = () => {
      messagesEndRef.current?.scrollIntoView(
        instant ? { behavior: "auto" } : { behavior: "smooth" },
      );
    };
    // Double rAF ensures DOM has flushed before scrolling
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  }, []);

  useEffect(() => {
    if (!historyLoading && messages.length > 0) {
      scrollToBottom(true);
    }
  }, [historyLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-scroll when user returns to app/tab (visibility change)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && messages.length > 0) {
        scrollToBottom(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [messages.length, scrollToBottom]);

  // FASE 2 (2026-05-05) — softResync on foreground.
  //
  // Drain backend pending messages on resume independently of SSE state.
  // SSE may be a zombie (TCP alive, no events delivered): in that case the
  // useKaelSSE force-reconnect will fire `kael-sse-connected` and the other
  // effect drains. But if appStateChange fires *before* SSE recovers, or
  // the user returns very briefly, this guarantees we still hit
  // `/chat/history/pending` and bring back any autonomous turn that was
  // generated while we were backgrounded.
  //
  // Idempotent: fetchAndAppendPending dedups by backend_turn_id +
  // client_message_id (mergeHistoryIntoState rules), so calling it twice
  // (here + on kael-sse-connected) cannot produce duplicates.
  //
  // NOTE: this effect is declared AFTER fetchAndAppendPending below to avoid
  // a TDZ error in the minified production bundle (Vite hoists `const` decls
  // as `let` and the effect body would reference fetchAndAppendPending
  // before its initializer runs in the same render tick).

  const now = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  // -----------------------------------------------------------------
  // SSE autonomous message listener
  //
  // When useKaelSSE (running in AppShell) dispatches "kael-autonomous-message",
  // we fetch the FULL message from /chat/history/pending and append it.
  // Also handles "kael-sse-connected" (reconnect catch-up).
  //
  // Dedup: check backend_turn_id against existing messages.
  // No polling. SSE is the sole trigger.
  // -----------------------------------------------------------------
  const fetchAndAppendPending = useCallback(async () => {
    const nowMs = Date.now();
    const MIN_PENDING_FETCH_INTERVAL_MS = 700;

    // Pending drain readiness is independent from watermark value.
    // Session can be valid/ready even when after_ts is still 0 (first boot/new session).
    if (!pendingDrainReadyRef.current) return;

    // Coalesce burst triggers (visibilitychange + reconnect + server-restarted)
    // even when no fetch is currently in flight.
    if (nowMs - lastPendingFetchStartedAtRef.current < MIN_PENDING_FETCH_INTERVAL_MS) {
      return;
    }
    lastPendingFetchStartedAtRef.current = nowMs;

    // BUG-UI-DUP fix (2026-05-06): if a fetch is already in flight, await it
    // and return. Concurrent triggers (visibilitychange + kael-sse-connected +
    // kael-server-restarted) must NOT race — they share the same Promise.
    if (fetchInFlightRef.current) {
      try { await fetchInFlightRef.current; } catch { /* swallow; original caller already logged */ }
      return;
    }

    const afterTs = normalizeAfterTs(lastFetchTsRef.current);
    emitTelemetry("softResync.started", { afterTs });

    const job = (async () => {
      try {
        const result = await chatApi.fetchPendingMessages(afterTs, sessionId);
        const received = result?.messages?.length ?? 0;
        // Watermark advances only after successful fetch to avoid message loss.
        const maxReceivedTs = Math.max(
          afterTs,
          ...((result?.messages ?? [])
            .map((m: any) =>
              typeof m?.timestamp === "number"
                ? m.timestamp
                : typeof m?.ts === "number"
                  ? m.ts
                  : 0
            )
            .filter((n: number) => Number.isFinite(n) && n > 0))
        );
        if (maxReceivedTs > afterTs) {
          lastFetchTsRef.current = maxReceivedTs;
        }

        if (!received) {
          emitTelemetry("softResync.merged", { received: 0, appended: 0 });
          return;
        }

        let appended = 0;
        setMessages((prev) => {
          const newMsgs: ChatMessage[] = result.messages
            .map(mapBackendMsg);

          const combined = mergeMessagesIdempotent(prev, newMsgs);
          appended = combined.length - prev.length;
          return combined;
        });

        emitTelemetry("softResync.merged", { received, appended });
        scrollToBottom();
      } catch (err) {
        const errName = err instanceof Error ? err.name : "unknown";
        emitTelemetry("softResync.failed", { error: errName });
        console.warn("[Chat] Failed to fetch pending messages:", err);
      }
    })();

    fetchInFlightRef.current = job;
    try {
      await job;
    } finally {
      fetchInFlightRef.current = null;
    }
  }, [sessionId, mapBackendMsg, scrollToBottom]);

  // Visibility resume catch-up (moved here from above the fetchAndAppendPending
  // declaration to avoid TDZ in minified prod bundle — see note above).
  useEffect(() => {
    if (lifecycleState !== "online") return;
    const handleResume = () => {
      if (document.visibilityState === "visible") {
        fetchAndAppendPending();
      }
    };
    document.addEventListener("visibilitychange", handleResume);
    return () => document.removeEventListener("visibilitychange", handleResume);
  }, [lifecycleState, fetchAndAppendPending]);

  useEffect(() => {
    if (lifecycleState !== "online") return;

    const handleAutonomous = () => {
      fetchAndAppendPending();
    };

    const handleReconnect = () => {
      // Catch up on any messages missed while disconnected
      fetchAndAppendPending();
    };

    const handleServerRestarted = (evt: Event) => {
      const detail = (evt as CustomEvent<{ oldBootId?: string; newBootId?: string }>).detail;
      const newBootId = detail?.newBootId ?? null;
      if (newBootId && lastRestartMergeBootIdRef.current === newBootId) {
        return;
      }
      if (newBootId) {
        lastRestartMergeBootIdRef.current = newBootId;
      }
      // Server restarted — reset the guard so the history effect can fire again,
      // then soft-merge: keep local messages visible without flash/disappearance.
      console.warn("[Chat] Server restarted detected — reloading history...");
      // Reset the load guard: without this, historyLoadedRef.current stays true
      // and the useEffect for initial load never fires again, leaving the chat
      // showing stale (or no) messages after a backend restart.
      historyLoadedRef.current = false;
      (async () => {
        try {
          const data = await chatApi.getChatHistory(sessionId);
          if (data?.messages?.length) {
            mergeHistoryIntoState(data.messages);
          }
          // Mark loaded so the useEffect doesn't double-fire on the same state tick
          historyLoadedRef.current = true;
          pendingDrainReadyRef.current = true;
          const maxHistoryTs = getMaxTimestamp(data?.messages ?? []);
          if (maxHistoryTs > 0) {
            lastFetchTsRef.current = maxHistoryTs;
          }
        } catch (err) {
          console.warn("[Chat] History merge after restart failed:", err);
          // Leave historyLoadedRef.current = false so a future lifecycle
          // state change retriggers the initial load effect
        }
      })();
    };

    window.addEventListener("kael-autonomous-message", handleAutonomous);
    window.addEventListener("kael-sse-connected", handleReconnect);
    window.addEventListener("kael-server-restarted", handleServerRestarted);
    return () => {
      window.removeEventListener("kael-autonomous-message", handleAutonomous);
      window.removeEventListener("kael-sse-connected", handleReconnect);
      window.removeEventListener("kael-server-restarted", handleServerRestarted);
    };
  }, [lifecycleState, fetchAndAppendPending, mergeHistoryIntoState, sessionId, getMaxTimestamp]);

  // Listen for agent mode toggle from BottomNav
  useEffect(() => {
    const handler = (e: Event) => {
      const active = (e as CustomEvent).detail?.active ?? false;
      setAgentMode(active);
    };
    window.addEventListener("kael-agent-mode-changed", handler);
    return () => window.removeEventListener("kael-agent-mode-changed", handler);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      // If editing a previous message, remove it (and its Kael reply) before re-sending
      setMessages((prev) => {
        const editingIdx = prev.findIndex((m) => m.isEditing);
        if (editingIdx >= 0) {
          // Remove the edited user message and all subsequent messages
          // (they belong to the old conversation branch)
          return prev.slice(0, editingIdx);
        }
        return prev;
      });

      // Stable UUID for this send — survives restarts and is used to reconcile
      // the optimistic message with the backend-persisted turn on history reload.
      const clientMsgId = crypto.randomUUID();

      const userMsg: ChatMessage = {
        id: clientMsgId,
        text,
        time: now(),
        timestamp: Date.now() / 1000,
        sender: "user",
        feedback: null,
        client_message_id: clientMsgId,
      };
      setMessages((prev) => [...prev, userMsg]);
      scrollToBottom();

      // --- Kael is ALWAYS the primary chat route ---
      setIsTyping(true);
      try {
        const startTime = Date.now();
        const response = await chatApi.sendMessage(text, sessionId, undefined, clientMsgId);
        const latency = Date.now() - startTime;

        setIsTyping(false);

        // ACK: promote the optimistic user message with its backend_turn_id now
        // that the server has confirmed persistence. This prevents mergeHistoryIntoState
        // from treating it as "local-only" and appending it again on history reload.
        if (response.user_turn_id != null) {
          setMessages((prev) =>
            prev.map((m) =>
              m.client_message_id === clientMsgId
                ? { ...m, backend_turn_id: String(response.user_turn_id) }
                : m
            )
          );
        }

        const assistantIdentity = resolveAssistantIdentity(
          response as unknown as Record<string, unknown>,
          sessionId,
          response.reply ?? "",
          Date.now() / 1000,
        );
        if (assistantIdentity.idSource === "fallback") {
          console.warn("[Chat] assistant_turn_id missing: using stable fallback id", {
            sessionId,
            messageId: assistantIdentity.messageId,
          });
        }
        const normalizedReply = normalizeAssistantPayload(response.reply ?? "", response.meta);

        const responseMsg: ChatMessage = {
          id: assistantIdentity.messageId,
          text: normalizedReply.text,
          time: now(),
          timestamp: Date.now() / 1000,
          sender: response.sender || "kael",
          feedback: null,
          backend_turn_id: assistantIdentity.backendTurnId,
          latency,
          meta: { ...(normalizedReply.meta ?? {}), id_source: assistantIdentity.idSource },
          delivery_mode: response.delivery_mode ?? undefined,
          audioUrl: normalizeAudioUrl(response.voice_audio),
          image: response.image_base64
            ? `data:${response.image_mime ?? "image/png"};base64,${response.image_base64}`
            : undefined,
          agent_id: response.agent_id,
          agent_name: response.agent_name,
          agent_avatar: response.agent_avatar,
        };
        setMessages((prev) => mergeMessagesIdempotent(prev, [responseMsg]));
        scrollToBottom();
        // Trigger instant Observatory refresh after chat interaction
        window.dispatchEvent(new CustomEvent("kael-observatory-refresh"));
        if (response.avatar_job_id) {
          const msgId = responseMsg.id;
          pollAndFetchAvatarVideo(response.avatar_job_id).then((videoDataUrl) => {
            if (videoDataUrl) {
              setMessages((prev) =>
                prev.map((m) => (m.id === msgId ? { ...m, videoUrl: videoDataUrl } : m))
              );
            }
          });
        }

        if (agentMode) {
          try {
            const agentHistory: ExternalChatMessage[] = [...messages, userMsg]
              .filter((m) => m.sender === "user" || m.sender === "external_agent")
              .slice(-20)
              .map((m) => ({
                role: m.sender === "user" ? "user" as const : "assistant" as const,
                content: m.text,
              }));

            const model = getSelectedModel();
            const reply = await sendExternalAgentMessage(agentHistory);

            const agentMsg: ChatMessage = {
              id: (Date.now() + 2).toString(),
              text: reply,
              time: now(),
              timestamp: Date.now() / 1000,
              sender: "external_agent",
              feedback: null,
              agent_id: model.id,
              agent_name: `${model.providerLabel} · ${model.label}`,
            };
            setMessages((prev) => [...prev, agentMsg]);
            scrollToBottom();
          } catch (error) {
            console.warn("[Chat] External agent unavailable:", error);
          }
        }
      } catch (error) {
        setIsTyping(false);
        const isTimeout =
          error instanceof Error &&
          (error.name === "AbortError" || error.message.includes("timeout"));

        if (isTimeout) {
          // Timeout doesn't mean the backend failed — long replies (60-180s) can
          // exceed the client AbortController window. Show a softer message and
          // keep polling for the response.
          toast.error("Risposta in ritardo — Kael sta elaborando...", { duration: 6000 });
          // Poll aggressively: try at 5s, 15s, 30s after timeout
          setTimeout(() => fetchAndAppendPending(), 5_000);
          setTimeout(() => fetchAndAppendPending(), 15_000);
          setTimeout(() => fetchAndAppendPending(), 30_000);
        } else {
          const errorMsg = error instanceof Error ? error.message : "Failed to send message";
          toast.error(errorMsg);
          // Do NOT invalidateBackendCache — user URL is source of truth.
          // Just trigger re-discovery which will probe without overwriting.
          probeAndResolveBackend().catch(() => {});
          // Reconcile: backend may have completed the reply after client timeout.
          setTimeout(() => fetchAndAppendPending(), 5_000);
        }
      }
    },
    [sessionId, agentMode, messages, fetchAndAppendPending, normalizeAssistantPayload]
  );

  const handleImageUpload = useCallback(
    async (file: File, caption?: string) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const imgMsgId = Date.now().toString();
        const clientMsgId = crypto.randomUUID();
        const imgMsg: ChatMessage = {
          id: imgMsgId,
          // Show the caption text in the user message bubble (like Telegram/ChatGPT)
          text: caption ?? "",
          time: now(),
          timestamp: Date.now() / 1000,
          sender: "user",
          image: ev.target?.result as string,
          feedback: null,
          client_message_id: clientMsgId,
        };
        setMessages((prev) => [...prev, imgMsg]);
        scrollToBottom();

        setIsTyping(true);
        try {
          const startTime = Date.now();
          const response = await chatApi.sendImage(file, sessionId, caption);
          const latency = Date.now() - startTime;

          setIsTyping(false);
          // Warn user if vision failed (Kael replied without seeing the image)
          if ((response as any).vision_ok === false && (response as any).failure_kind) {
            const failureKind: string = (response as any).failure_kind ?? "";
            const visionErrorMsgs: Record<string, string> = {
              not_configured: "La visione non è configurata — assicurati che Moondream sia installato in Ollama",
              ollama_unreachable: "Ollama non è raggiungibile",
              moondream_error: "Kael non è riuscito ad analizzare l'immagine",
              empty_response: "Moondream ha restituito una risposta vuota",
            };
            const msg = Object.entries(visionErrorMsgs).find(([key]) =>
              failureKind.startsWith(key)
            )?.[1] ?? "Visione non disponibile";
            toast.warning(msg);
          }

          // Assign backend_turn_id to the user image message so it persists across reloads
          const userTurnId = (response as any).user_turn_id;
          if (userTurnId != null) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === imgMsgId
                  ? { ...m, backend_turn_id: String(userTurnId) }
                  : m
              )
            );
          }

          const assistantIdentity = resolveAssistantIdentity(
            response as unknown as Record<string, unknown>,
            sessionId,
            response.reply ?? "",
            Date.now() / 1000,
          );
          if (assistantIdentity.idSource === "fallback") {
            console.warn("[Chat] image reply without assistant_turn_id: fallback id used", {
              sessionId,
              messageId: assistantIdentity.messageId,
            });
          }
          const normalizedReply = normalizeAssistantPayload(response.reply ?? "", response.meta);

          const responseMsg: ChatMessage = {
            id: assistantIdentity.messageId,
            text: normalizedReply.text,
            time: now(),
            timestamp: Date.now() / 1000,
            sender: response.sender || "kael",
            feedback: null,
            backend_turn_id: assistantIdentity.backendTurnId,
            latency,
            meta: { ...(normalizedReply.meta ?? {}), id_source: assistantIdentity.idSource },
            audioUrl: normalizeAudioUrl(response.voice_audio),
            // Image generation: if backend generated an image, embed it.
            image: response.image_base64
              ? `data:${response.image_mime ?? "image/png"};base64,${response.image_base64}`
              : undefined,
            agent_id: response.agent_id,
            agent_name: response.agent_name,
            agent_avatar: response.agent_avatar,
          };
          setMessages((prev) => mergeMessagesIdempotent(prev, [responseMsg]));
          scrollToBottom();
          // Avatar video: async poll if backend triggered a render job
          if (response.avatar_job_id) {
            const msgId = responseMsg.id;
            pollAndFetchAvatarVideo(response.avatar_job_id).then((videoDataUrl) => {
              if (videoDataUrl) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === msgId ? { ...m, videoUrl: videoDataUrl } : m))
                );
              }
            });
          }
        } catch (error) {
          setIsTyping(false);
          const isTimeout =
            error instanceof Error &&
            (error.name === "AbortError" || error.message.includes("timeout"));
          if (isTimeout) {
            toast.error("Risposta in ritardo — Kael sta elaborando l'immagine...", { duration: 6000 });
            setTimeout(() => fetchAndAppendPending(), 5_000);
            setTimeout(() => fetchAndAppendPending(), 20_000);
          } else {
            toast.error(error instanceof Error ? error.message : "Failed to send image");
            setTimeout(() => fetchAndAppendPending(), 5000);
          }
        }
      };
      reader.readAsDataURL(file);
    },
    [sessionId, fetchAndAppendPending, normalizeAssistantPayload]
  );

  const handleVoiceNote = useCallback(
    async (blob: Blob) => {
      const clientMessageId = crypto.randomUUID();
      const url = URL.createObjectURL(blob);
      const voiceMsg: ChatMessage = {
        id: clientMessageId,
        client_message_id: clientMessageId,
        text: "",
        time: now(),
        timestamp: Date.now() / 1000,
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
        const response = await chatApi.sendVoiceNote(blob, sessionId, clientMessageId);
        const latency = Date.now() - startTime;

        setIsTyping(false);

        // ACK: Update the optimistic message with the backend turn ID
        if (response.user_turn_id != null) {
          setMessages((prev) =>
            prev.map((m) =>
              m.client_message_id === clientMessageId
                ? { ...m, backend_turn_id: String(response.user_turn_id) }
                : m
            )
          );
        }
        
        const assistantIdentity = resolveAssistantIdentity(
          response as unknown as Record<string, unknown>,
          sessionId,
          response.reply ?? "",
          Date.now() / 1000,
        );
        if (assistantIdentity.idSource === "fallback") {
          console.warn("[Chat] voice reply without assistant_turn_id: fallback id used", {
            sessionId,
            messageId: assistantIdentity.messageId,
          });
        }
        const normalizedReply = normalizeAssistantPayload(response.reply ?? "", response.meta);

        const responseMsg: ChatMessage = {
          id: assistantIdentity.messageId,
          text: normalizedReply.text,
          time: now(),
          timestamp: Date.now() / 1000,
          sender: response.sender || "kael",
          feedback: null,
          backend_turn_id: assistantIdentity.backendTurnId,
          latency,
          meta: { ...(normalizedReply.meta ?? {}), id_source: assistantIdentity.idSource },
          delivery_mode: response.voice_audio ? "voice_note" : undefined,
          audioUrl: normalizeAudioUrl(response.voice_audio),
          // Image generation: if backend generated an image, embed it.
          image: response.image_base64
            ? `data:${response.image_mime ?? "image/png"};base64,${response.image_base64}`
            : undefined,
          agent_id: response.agent_id,
          agent_name: response.agent_name,
          agent_avatar: response.agent_avatar,
        };
        setMessages((prev) => mergeMessagesIdempotent(prev, [responseMsg]));
        scrollToBottom();
    [sessionId, fetchAndAppendPending, normalizeAssistantPayload]
        if (response.avatar_job_id) {
          const msgId = responseMsg.id;
          pollAndFetchAvatarVideo(response.avatar_job_id).then((videoDataUrl) => {
            if (videoDataUrl) {
              setMessages((prev) =>
                prev.map((m) => (m.id === msgId ? { ...m, videoUrl: videoDataUrl } : m))
              );
            }
          });
        }
      } catch (error) {
        setIsTyping(false);
        toast.error(error instanceof Error ? error.message : "Failed to send voice note");
        // Reconcile: fetch pending in case backend completed after timeout
        setTimeout(() => fetchAndAppendPending(), 5000);
      }
    },
    [sessionId, fetchAndAppendPending]
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
        const res = await chatApi.submitFeedback(message.backend_turn_id, type);
        if (res.cap_reached) {
          setMessages((prev) =>
            prev.map((m) => m.id === id ? { ...m, feedbackCapReached: true } : m)
          );
        }
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, feedback: message.feedback } : m)
        );
        toast.error(error instanceof Error ? error.message : "Failed to submit feedback");
      }
    },
    [messages]
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

  const handleEditMessage = useCallback(
    (id: string, currentText: string) => {
      // Mark the message as being edited (dimmed in UI) instead of removing it immediately
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isEditing: true } : m))
      );
      // Dispatch event so ChatInput can pick up the text and the messageId
      window.dispatchEvent(
        new CustomEvent("kael-edit-message", { detail: { text: currentText, messageId: id } })
      );
    },
    []
  );

  const handleCancelEdit = useCallback(() => {
    // Restore all messages marked as editing back to normal
    setMessages((prev) =>
      prev.map((m) => (m.isEditing ? { ...m, isEditing: false } : m))
    );
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
            onPlayTTS={handlePlayTTS}
            onImageClick={setViewerImage}
            onEditMessage={handleEditMessage}
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
        onOpenServices={() => navigate("/workspace")}
        onCancelEdit={handleCancelEdit}
        disabled={lifecycleState !== "online"}
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

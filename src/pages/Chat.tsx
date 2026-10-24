import { useState, useRef, useCallback, useEffect } from "react";
import { Phone } from "lucide-react";
import { App as CapApp } from "@capacitor/app";
import { useTheme } from "@/lib/store/theme-context";
import { useSession } from "@/hooks/useSession";
import { useAgenticActions } from "@/hooks/useAgenticActions";
import { useBackendConnection } from "@/context/backend-connection";
import { useServiceHealthToast } from "@/hooks/useServiceHealthToast";
import { useChatWallpaper } from "@/hooks/useChatWallpaper";
import { useLongPress } from "@/hooks/useLongPress";
import chatBg from "@/assets/chat-bg.jpg";
import KaelHeader from "@/components/layout/KaelHeader";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import type { NativeVoicePlaybackState } from "@/components/chat/NativeVoiceNoteControl";
import ChatTypingDots from "@/components/chat/ChatTypingDots";
import OutboxAttentionPanel from "@/components/chat/OutboxAttentionPanel";
import ChatProcessingNotice from "@/components/chat/ChatProcessingNotice";
import { createChatRecoveryTask } from "@/lib/chat/recoveryTask";
import {
  applyChatProcessingOutcome,
  reconcileChatProcessingMessages,
  type ChatProcessingState,
} from "@/lib/chat/processingNotice";
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
import type { BackendChatMessage, QuotedMessagePayload } from "@/lib/api/chat";
import { fetchAvatarVideo, getVideoJobStatus } from "@/lib/api/avatar";
import { emitTelemetry } from "@/lib/telemetry/sseTelemetry";
import {
  mergeMessagesIdempotent,
  mergeDeliveryMetadata,
  normalizeAfterTs,
  resolveAssistantIdentity,
  resolveBackendDeliveryMode,
  resolveBackendMessageIdentity,
  resolveHistoryMessageId,
  voiceNoteReceiptPresentation,
} from "@/lib/chat/reliability";
import { getCanonicalTimeMs } from "@/lib/chat/timeNormalization";
import { applyDiagnosticMarkers } from "@/lib/chat/diagnosticMarkers";
import {
  enqueueTextExchange,
  getTextOutboxSummary,
  getTimelineCursor,
  ingestTimelinePage,
  listTextExchanges,
  listTimelineMessages,
  MANUAL_OUTBOX_CONFIRMATION,
  deferTextExchangeManually,
  MAX_TEXT_OUTBOX_ENTRIES,
  recoverInboxBatches,
  removeTextExchangeManually,
  retryTextExchangeManually,
  type TextOutboxSummary,
} from "@/lib/chat/durableExchangeStore";
import {
  drainTextOutbox,
  outboxDeliveryStatus,
  nextTextOutboxAttemptAt,
  type TextOutboxDrainResult,
  type TextOutboxDrainTrigger,
} from "@/lib/chat/textOutbox";

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
import {
  createImageDeliveryAcknowledger,
  imageGenerationJobIdFromMeta,
  pollImageGenerationJob,
} from "@/lib/api/imageJobs";
import {
  applyImageJobReceipt,
  withImageGenerationClientState,
} from "@/lib/chat/imageJobDelivery";
import { sendExternalAgentMessage, getSelectedModel, type ExternalChatMessage } from "@/lib/externalAgent";
import { nativeCallVoiceService } from "@/lib/audio/nativeCallVoiceService";

// Default conversation ID for the main Kael chat
const DEFAULT_CONVERSATION_ID = "kael-main";
const CHAT_CURSOR_STORAGE_KEY = "kael-chat-turn-cursor-v1";

function persistTurnCursor(cursor: number): void {
  if (!Number.isSafeInteger(cursor) || cursor < 0) return;
  try {
    localStorage.setItem(CHAT_CURSOR_STORAGE_KEY, String(cursor));
  } catch {
    // Storage can be unavailable in privacy-restricted WebViews; runtime ref remains authoritative.
  }
}

interface QuotedPreview {
  authorLabel: string;
  textPreview: string;
}

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nativeVoicePlayback, setNativeVoicePlayback] = useState<{
    turnId: number | null;
    state: NativeVoicePlaybackState;
  }>({ turnId: null, state: "idle" });
  const nativeVoiceAttemptRef = useRef(0);
  const [quotedPreview, setQuotedPreview] = useState<QuotedPreview | null>(null);
  const [quotedMessagePayload, setQuotedMessagePayload] = useState<QuotedMessagePayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [processingNotice, setProcessingNotice] = useState<ChatProcessingState | null>(null);
  useEffect(() => {
    if (processingNotice && !["waiting", "in_progress", "unconfirmed"].includes(processingNotice.kind)) {
      window.dispatchEvent(new CustomEvent("kael-generation-reset"));
    }
  }, [processingNotice]);
  const [continuityReady, setContinuityReady] = useState(false);
  const [continuityError, setContinuityError] = useState<string | null>(null);
  const [timelineReady, setTimelineReady] = useState(false);
  const [timelineError, setTimelineError] = useState(false);
  const [outboxSummary, setOutboxSummary] = useState<TextOutboxSummary>({
    total: 0,
    capacity: MAX_TEXT_OUTBOX_ENTRIES,
    blocked: false,
    attention: [],
  });
  const [outboxActionBusy, setOutboxActionBusy] = useState<string | null>(null);
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
  // IndexedDB is the only client-side cursor authority. localStorage receives
  // a downstream compatibility mirror but is never read back into this ref.
  const lastFetchTurnIdRef = useRef<number>(0);

  /**
   * BUG-UI-DUP fix (2026-05-06): mutex for fetchAndAppendPending.
   * Three concurrent triggers can fire simultaneously after backend restart
   * + APK foreground (visibilitychange, kael-sse-connected, kael-server-restarted).
   * Without serialization they all read the same `after_ts` and the resulting
   * sort can show duplicated/mixed last messages. We hold the in-flight Promise
   * here; callers share one flight and coalesce one trailing read if another
   * event arrives during that flight. Dedup invariants stay unchanged.
   */
  const historyRecoveryRef = useRef(createChatRecoveryTask());
  const pendingRecoveryRef = useRef(createChatRecoveryTask());
  const outboxRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboxOnlineRef = useRef(false);
  const continuityInitializedRef = useRef(false);
  const lastRestartMergeBootIdRef = useRef<string | null>(null);

  useEffect(() => () => {
    // Invalidate stale continuations without releasing actual in-flight work.
    historyRecoveryRef.current.invalidate();
    pendingRecoveryRef.current.invalidate();
  }, [sessionId, lifecycleState]);

  useEffect(() => {
    historyLoadedRef.current = false;
    pendingDrainReadyRef.current = false;
    setTimelineReady(false);
  }, [sessionId]);

  const getMaxTimestamp = useCallback((items: BackendChatMessage[]): number => {
    return items
      .map((m) =>
        typeof m?.timestamp === "number"
          ? m.timestamp
          : typeof m?.ts === "number"
            ? m.ts
            : 0
      )
      .filter((n: number) => Number.isFinite(n) && n > 0)
      .reduce((max: number, n: number) => (n > max ? n : max), 0);
  }, []);

  const getMaxTurnId = useCallback((items: BackendChatMessage[]): number => {
    return items
      .map((m) => Number(m?.id ?? m?.turn_id ?? m?.backend_turn_id ?? 0))
      .filter((n: number) => Number.isSafeInteger(n) && n > 0)
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
      share_once: "Sfondo condiviso con Arrakis 📸",
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
          toast.error("Sfondo impostato localmente, ma sync con Arrakis fallita");
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
  const mapBackendMsg = useCallback((m: BackendChatMessage): ChatMessage => {
    // Keep durable asset identity separate from the short-lived display URL.
    // The scoped URL is resolved asynchronously into React state and is never
    // persisted into the timeline WAL or localStorage.
    let imageUrl: string | undefined = m.image;
    let imageAssetId = m.image_asset_id;
    if (imageUrl?.startsWith("__asset__:")) {
      imageAssetId = imageUrl.slice("__asset__:".length);
      imageUrl = undefined;
    } else if (imageUrl) {
      const legacyAsset = imageUrl.match(
        /\/media\/gallery\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/file(?:[?#]|$)/,
      );
      if (legacyAsset) {
        imageAssetId = legacyAsset[1];
        imageUrl = undefined;
      }
    } else if (!imageUrl && imageAssetId) {
      imageUrl = undefined;
    }

    // BUG-M20 fix (2026-05-09): Autonomy messages with timestamp=0 from DB would
    // sort to the beginning. Central normalization applies fallback exactly once
    // at ingestion, ensuring stable chronological order (never recalculated in sort).
    const canonicalTimeMs = getCanonicalTimeMs(m);
    const normalizedTs = canonicalTimeMs / 1000;
    const backendIdentity = resolveBackendMessageIdentity(m);
    const sender = backendIdentity.sender;
    const rawText = m.text ?? m.content ?? "";
    const rawMeta = (m.meta ?? m.metadata ?? undefined) as Record<string, unknown> | undefined;
    const normalizedMessage =
      sender === "user"
        ? { text: rawText, meta: rawMeta }
        : normalizeAssistantPayload(rawText, rawMeta);
    const rawBubbles = Array.isArray(m.bubbles)
      ? m.bubbles
      : Array.isArray(rawMeta?.bubbles)
        ? rawMeta.bubbles
        : undefined;
    const normalizedBubbles = sender === "user"
      ? undefined
      : rawBubbles
        ?.map((part: unknown) => String(part ?? ""))
        .filter((part: string) => part.length > 0);

    const audioDuration = typeof m.duration_ms === "number"
      ? Math.max(0, m.duration_ms / 1000)
      : typeof m.duration === "number"
        ? Math.max(0, m.duration)
        : undefined;
    return {
      id: resolveHistoryMessageId(m, sessionId),
      text: normalizedMessage.text,
      bubbles: normalizedBubbles && normalizedBubbles.length > 0 ? normalizedBubbles : undefined,
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
      audioDuration,
      image: imageUrl,
      imageAssetId,
      meta: normalizedMessage.meta,
      delivery_mode: resolveBackendDeliveryMode(m),
      agent_id: backendIdentity.agentId,
      agent_name: backendIdentity.agentName,
      agent_avatar: backendIdentity.agentAvatar,
    };
  }, [normalizeAssistantPayload, sessionId]);

  const resolvingImageAssetsRef = useRef<Set<string>>(new Set());
  const pollingImageJobsRef = useRef<Map<string, AbortController>>(new Map());
  const imageDeliveryAcknowledgerRef = useRef(createImageDeliveryAcknowledger());

  useEffect(() => {
    const activePolls = pollingImageJobsRef.current;
    return () => {
      activePolls.forEach((controller) => controller.abort());
      activePolls.clear();
    };
  }, []);

  useEffect(() => {
    for (const message of messages) {
      const jobId = imageGenerationJobIdFromMeta(message.meta);
      const clientState = String(message.meta?.image_generation_client_state ?? "");
      if (
        !jobId ||
        message.imageAssetId ||
        clientState === "FAILED" ||
        clientState === "CANCELLED" ||
        clientState === "POLL_EXHAUSTED" ||
        clientState === "POLL_ERROR"
      ) {
        continue;
      }

      const pollKey = `${sessionId}\u0000${jobId}`;
      if (pollingImageJobsRef.current.has(pollKey)) continue;
      const controller = new AbortController();
      pollingImageJobsRef.current.set(pollKey, controller);

      void pollImageGenerationJob(jobId, sessionId, { signal: controller.signal })
        .then((receipt) => {
          if (controller.signal.aborted) return;
          setMessages((current) => current.map((candidate) => {
            if (imageGenerationJobIdFromMeta(candidate.meta) !== jobId) return candidate;
            return receipt
              ? applyImageJobReceipt(candidate, jobId, receipt)
              : withImageGenerationClientState(candidate, "POLL_EXHAUSTED");
          }));
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.warn("[Chat] image generation job polling stopped", {
            jobId,
            error: error instanceof Error ? error.name : "unknown",
          });
          setMessages((current) => current.map((candidate) =>
            imageGenerationJobIdFromMeta(candidate.meta) === jobId
              ? withImageGenerationClientState(candidate, "POLL_ERROR")
              : candidate
          ));
        })
        .finally(() => {
          pollingImageJobsRef.current.delete(pollKey);
        });
    }
  }, [messages, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const pendingIds = Array.from(new Set(
      messages
        .filter((message) => message.imageAssetId && !message.image)
        .map((message) => message.imageAssetId as string)
        .filter((assetId) => !resolvingImageAssetsRef.current.has(assetId)),
    ));
    if (pendingIds.length === 0) return () => { cancelled = true; };
    pendingIds.forEach((assetId) => resolvingImageAssetsRef.current.add(assetId));

    void Promise.all(pendingIds.map(async (assetId) => {
      try {
        return [assetId, await getGalleryFileUrl(assetId)] as const;
      } catch {
        return [assetId, ""] as const;
      } finally {
        resolvingImageAssetsRef.current.delete(assetId);
      }
    })).then((resolved) => {
      if (cancelled) return;
      const urls = new Map(resolved.filter((entry) => Boolean(entry[1])));
      if (urls.size === 0) return;
      setMessages((current) => current.map((message) => {
        const url = message.imageAssetId ? urls.get(message.imageAssetId) : undefined;
        return url ? { ...message, image: url } : message;
      }));
    });

    return () => { cancelled = true; };
  }, [messages]);

  const handleGeneratedImageLoad = useCallback((message: ChatMessage) => {
    const jobId = imageGenerationJobIdFromMeta(message.meta);
    const assetId = message.imageAssetId;
    if (!jobId || !assetId) return;
    if (message.meta?.image_generation_client_state === "DELIVERED") return;

    void imageDeliveryAcknowledgerRef.current(jobId, sessionId, assetId)
      .then((sent) => {
        if (!sent) return;
        setMessages((current) => current.map((candidate) =>
          candidate.id === message.id && candidate.imageAssetId === assetId
            ? withImageGenerationClientState(candidate, "DELIVERED")
            : candidate
        ));
      })
      .catch((error) => {
        console.warn("[Chat] image delivery acknowledgement failed", {
          jobId,
          error: error instanceof Error ? error.name : "unknown",
        });
      });
  }, [sessionId]);

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
  const mergeHistoryIntoState = useCallback((backendMessages: BackendChatMessage[]) => {
    const incoming = backendMessages.map(mapBackendMsg);
    setMessages((prev) => {
      if (prev.length === 0) return incoming;

      // Index incoming by both reconciliation keys.
      const incomingByBackendTurnId = new Map(
        incoming.filter((m) => m.backend_turn_id).map((m) => [m.backend_turn_id, m])
      );
      const incomingByClientMsgId = new Map(
        incoming
          .filter((m) => m.sender === "user" && m.client_message_id)
          .map((m) => [m.client_message_id, m])
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
      const existingDeliveryMeta = new Map(
        prev
          .filter((m) => m.sender === "user" && m.client_message_id && m.meta?.durable_outbox === true)
          .map((m) => [m.client_message_id, {
            exchange_status: m.meta?.exchange_status,
            durable_outbox: true,
          }])
      );

      const merged = incoming.map((m) => {
        const fb = existingFeedback.get(m.backend_turn_id);
        const localImg = existingImages.get(m.backend_turn_id);
        let result = fb ? { ...m, feedback: fb } : m;
        if (localImg && (!m.image || m.image.startsWith("__asset__"))) {
          result = { ...result, image: localImg };
        }
        const deliveryMeta = m.client_message_id
          ? existingDeliveryMeta.get(m.client_message_id)
          : undefined;
        if (deliveryMeta) {
          result = { ...result, meta: mergeDeliveryMetadata(result.meta, deliveryMeta) };
        }
        return result;
      });

      // Local-only: messages that don't match any incoming record by either key.
      // An optimistic user message that now has a backend_turn_id (ACKed before
      // this reload) or a matching client_message_id is already in `merged`
      // and must NOT be appended again.
      const localOnly = prev.filter((m) => {
        if (m.backend_turn_id && incomingByBackendTurnId.has(m.backend_turn_id)) return false;
        if (m.sender === "user" && m.client_message_id && incomingByClientMsgId.has(m.client_message_id)) return false;
        if (incomingByStableId.has(m.id)) return false;
        return true;
      });

      const combined = [...merged, ...localOnly];
      combined.sort((a, b) => {
        const aTs = typeof a.timestamp === "number" ? a.timestamp : 0;
        const bTs = typeof b.timestamp === "number" ? b.timestamp : 0;
          if (aTs !== bTs) return aTs - bTs;

          const aId = a.backend_turn_id ? Number(a.backend_turn_id) : NaN;
          const bId = b.backend_turn_id ? Number(b.backend_turn_id) : NaN;
          if (!Number.isNaN(aId) && !Number.isNaN(bId) && aId !== bId) {
            return aId - bId;
          }

          return a.id.localeCompare(b.id);
      });
      return combined;
    });
  }, [mapBackendMsg]);

  // Open and recover the local write-ahead logs before any network send or
  // cursor-based catch-up is allowed.  Outbox rows become optimistic bubbles
  // only after they have survived an IndexedDB transaction.
  useEffect(() => {
    if (continuityInitializedRef.current) return;
    continuityInitializedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        await recoverInboxBatches(DEFAULT_CONVERSATION_ID);

        const [cachedTimeline, outbox, summary] = await Promise.all([
          listTimelineMessages(DEFAULT_CONVERSATION_ID),
          listTextExchanges(),
          getTextOutboxSummary(),
        ]);
        if (cancelled) return;
        if (cachedTimeline.length) mergeHistoryIntoState(cachedTimeline);

        const optimistic: ChatMessage[] = outbox.map((entry) => ({
          id: entry.clientMessageId,
          client_message_id: entry.clientMessageId,
          backend_turn_id: entry.userTurnId,
          text: entry.requestBody.text,
          time: new Date(entry.createdAtMs).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
          timestamp: entry.createdAtMs / 1000,
          sender: "user",
          feedback: null,
          meta: {
            exchange_status: entry.errorCode && entry.attempts > 0
              && (entry.state === "queued" || entry.state === "queued_by_user")
              ? "retryable_failure"
              : entry.exchangeStatus ?? entry.state,
            durable_outbox: true,
          },
        }));
        if (optimistic.length) {
          const outboxByClientId = new Map(
            optimistic.map((message) => [message.client_message_id, message]),
          );
          setMessages((previous) => {
            // A USER row can already exist in the backend timeline while its
            // cognition is recovery_required. Persistence is not delivery.
            const overlaid = previous.map((message) => {
              if (message.sender !== "user" || !message.client_message_id) return message;
              const durable = outboxByClientId.get(message.client_message_id);
              if (!durable) return message;
              return {
                ...message,
                meta: mergeDeliveryMetadata(message.meta, durable.meta),
              };
            });
            return mergeMessagesIdempotent(overlaid, optimistic);
          });
        }
        setOutboxSummary(summary);

        const durableCursor = await getTimelineCursor(DEFAULT_CONVERSATION_ID);
        lastFetchTurnIdRef.current = durableCursor;
        persistTurnCursor(lastFetchTurnIdRef.current); // compatibility mirror only
        setContinuityReady(true);
      } catch {
        if (cancelled) return;
        setContinuityError("Archivio durevole chat non disponibile");
        setHistoryLoading(false);
        toast.error("Invio bloccato: archivio durevole chat non disponibile");
      }
    })();

    return () => { cancelled = true; };
  }, [mergeHistoryIntoState]);

  // A failed bootstrap is retried only by genuine lifecycle/reconnect/resume
  // events. The same owner serializes all history hydration paths.
  const loadHistory = useCallback((): Promise<void> => {
    if (!continuityReady || lifecycleState !== "online" || historyLoadedRef.current) {
      return Promise.resolve();
    }
    return historyRecoveryRef.current.request(async (isCurrent) => {
      if (!isCurrent() || historyLoadedRef.current) return;
      setHistoryLoading(true);
      let historyMessages: BackendChatMessage[] = [];
      try {
        const config = getApiConfig();
        if (!config.baseUrl) throw new Error("History backend URL not configured");
        const data = await chatApi.getChatHistory(sessionId);
        if (!isCurrent()) return;
        historyMessages = data?.messages ?? [];
        if (!historyMessages.length) {
          const pendingProbe = await chatApi.fetchPendingMessages(0, sessionId);
          if (!isCurrent()) return;
          if (pendingProbe.messages?.length) historyMessages = pendingProbe.messages;
        }
        if (historyMessages.length) {
          const maxHistoryTurnId = getMaxTurnId(historyMessages);
          const currentDurableCursor = await getTimelineCursor(DEFAULT_CONVERSATION_ID);
          if (!isCurrent()) return;
          // Snapshot rows never advance the contiguous pending cursor.
          const committed = await ingestTimelinePage({
            timelineKey: DEFAULT_CONVERSATION_ID,
            fromCursor: currentDurableCursor,
            nextCursor: currentDurableCursor,
            cursorKind: "snapshot",
            messages: historyMessages,
            batchId: `history:${sessionId}:${maxHistoryTurnId}:${historyMessages.length}`,
          });
          if (!isCurrent()) return;
          mergeHistoryIntoState(committed.messages);
          lastFetchTurnIdRef.current = committed.cursor;
          persistTurnCursor(committed.cursor);
        }
        if (!isCurrent()) return;
        historyLoadedRef.current = true;
        pendingDrainReadyRef.current = true;
        setTimelineReady(true);
        setTimelineError(false);
        const maxHistoryTs = getMaxTimestamp(historyMessages);
        if (maxHistoryTs > 0) lastFetchTsRef.current = maxHistoryTs;
      } catch (err) {
        if (!isCurrent()) return;
        historyLoadedRef.current = false;
        setTimelineError(true);
        console.warn("[Chat] History load failed:", err);
      } finally {
        if (isCurrent()) setHistoryLoading(false);
      }
    });
  }, [continuityReady, lifecycleState, sessionId, mergeHistoryIntoState, getMaxTimestamp, getMaxTurnId]);

  useEffect(() => {
    if (lifecycleState !== "online" && lifecycleState !== "checking") setHistoryLoading(false);
    void loadHistory().catch(() => {});
  }, [lifecycleState, loadHistory]);

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
  // When useKaelSSE (running in AppShell) dispatches "kael-new-message",
  // we fetch the FULL message from /chat/history/pending and append it.
  // Also handles "kael-sse-connected" (reconnect catch-up).
  //
  // Dedup: check backend_turn_id against existing messages.
  // No polling. SSE is the sole trigger.
  // -----------------------------------------------------------------
  const fetchAndAppendPending = useCallback(async () => {
    if (!pendingDrainReadyRef.current) return;
    // Every trigger while busy marks a trailing drain, including slow fetches
    // beyond the former 700ms window. Bursts share the same real flight.
    return pendingRecoveryRef.current.request(async (isCurrent) => {
      if (!isCurrent() || !pendingDrainReadyRef.current) return;
      try {
        // A real WAL transaction already in progress can commit after epoch
        // invalidation. Re-read the durable owner after that flight settled;
        // never resume a contiguous page from an obsolete in-memory cursor.
        const afterTurnId = await getTimelineCursor(DEFAULT_CONVERSATION_ID);
        if (!isCurrent()) return;
        if (afterTurnId < lastFetchTurnIdRef.current) {
          throw new Error("Durable timeline cursor regressed");
        }
        if (afterTurnId !== lastFetchTurnIdRef.current) {
          const committedRows = await listTimelineMessages(DEFAULT_CONVERSATION_ID);
          if (!isCurrent()) return;
          mergeHistoryIntoState(committedRows);
          lastFetchTurnIdRef.current = afterTurnId;
          persistTurnCursor(afterTurnId);
        }
        const afterTs = normalizeAfterTs(lastFetchTsRef.current);
        emitTelemetry("softResync.started", { afterTs, afterTurnId });
        let cursor = afterTurnId;
        let maxReceivedTs = afterTs;
        let received = 0;
        let appended = 0;
        const PAGE_LIMIT = 250;
        const MAX_CURSOR_PAGES = 20;

        for (let page = 0; page < MAX_CURSOR_PAGES; page += 1) {
          const result = await chatApi.fetchPendingMessages(
            afterTs,
            sessionId,
            cursor,
            PAGE_LIMIT,
          );
          if (!isCurrent()) return;
          const pageMessages = result?.messages ?? [];

          for (const message of pageMessages) {
            const ts = typeof message?.timestamp === "number"
              ? message.timestamp
              : typeof message?.ts === "number"
                ? message.ts
                : 0;
            if (Number.isFinite(ts) && ts > maxReceivedTs) maxReceivedTs = ts;
          }

          // fetchPendingMessages already validates cursor_kind and next_cursor.
          // Message ids are data, never cursor authority.
          const nextCursor = result.next_cursor;
          const hasMore = Boolean(result?.has_more);
          if (hasMore && nextCursor <= cursor) {
            throw new Error("pending cursor did not advance");
          }
          const committed = await ingestTimelinePage({
            timelineKey: DEFAULT_CONVERSATION_ID,
            fromCursor: cursor,
            nextCursor,
            cursorKind: "conversation_turn_id",
            messages: pageMessages,
            batchId: `pending:${sessionId}:${cursor}:${nextCursor}`,
          });
          if (!isCurrent()) return;
          cursor = committed.cursor;
          lastFetchTurnIdRef.current = cursor;
          // Compatibility mirror only. IndexedDB committed the page and cursor
          // in one transaction before this non-authoritative localStorage write.
          persistTurnCursor(cursor);
          received += committed.messages.length;
          if (committed.messages.length) {
            const newMessages: ChatMessage[] = committed.messages.map(mapBackendMsg);
            setProcessingNotice((current) => reconcileChatProcessingMessages(current, newMessages));
            setMessages((previous) => {
              const combined = mergeMessagesIdempotent(previous, newMessages);
              appended += combined.length - previous.length;
              return combined;
            });
          }
          if (!hasMore) break;
          if (page === MAX_CURSOR_PAGES - 1) {
            throw new Error("pending cursor page limit exceeded");
          }
        }

        if (!isCurrent()) return;
        setTimelineError(false);
        if (maxReceivedTs > afterTs) lastFetchTsRef.current = maxReceivedTs;

        if (!received) {
          emitTelemetry("softResync.merged", { received: 0, appended: 0 });
          return;
        }

        emitTelemetry("softResync.merged", { received, appended });
        scrollToBottom();
      } catch (err) {
        if (!isCurrent()) return;
        setTimelineError(true);
        const errName = err instanceof Error ? err.name : "unknown";
        emitTelemetry("softResync.failed", { error: errName });
        console.warn("[Chat] Failed to fetch pending messages:", err);
      }
    });
  }, [sessionId, mapBackendMsg, mergeHistoryIntoState, scrollToBottom]);

  const recoverTimeline = useCallback(() => {
    const isCurrent = historyRecoveryRef.current.checkpoint();
    return loadHistory().then(() => {
      // A delayed history continuation cannot start a fresh pending read after
      // unmount, session change, offline transition or another backend restart.
      if (isCurrent()) return fetchAndAppendPending();
    });
  }, [loadHistory, fetchAndAppendPending]);

  const applyOutboxResults = useCallback((results: TextOutboxDrainResult[]) => {
    for (const result of results) {
      setProcessingNotice((current) => applyChatProcessingOutcome(current, result));
      if (result.timelineMessages?.length) {
        const durableMessages = result.timelineMessages.map(mapBackendMsg);
        setMessages((previous) => mergeMessagesIdempotent(previous, durableMessages));
      }

      const visibleExchangeStatus = outboxDeliveryStatus(result);
      setMessages((previous) => previous.map((message) =>
        message.sender === "user" && message.client_message_id === result.clientMessageId
          ? {
              ...message,
              meta: {
                ...(message.meta ?? {}),
                exchange_status: visibleExchangeStatus,
                durable_outbox: true,
                ...(result.errorCode ? { exchange_error_code: result.errorCode } : {}),
              },
            }
          : message
      ));

      if (result.kind === "reply" || result.kind === "replay" || result.kind === "silence") {
        if (result.response?.avatar_job_id && result.response.assistant_turn_id != null) {
          const assistantTurnId = String(result.response.assistant_turn_id);
          pollAndFetchAvatarVideo(result.response.avatar_job_id).then((videoDataUrl) => {
            if (!videoDataUrl) return;
            setMessages((previous) =>
              previous.map((message) =>
                message.backend_turn_id === assistantTurnId
                  ? { ...message, videoUrl: videoDataUrl }
                  : message
              )
            );
          });
        }
        continue;
      }

      if (result.kind === "in_progress") {
        continue;
      }
      if (result.kind === "recovery_required") {
        // The single top error surface owns presentation.
        continue;
      }
      if (result.kind === "terminal_failure" || result.kind === "integrity_failure") {
        // Keep the receipt without a duplicate toast.
        continue;
      }

    }
    if (results.some((result) => result.timelineMessages?.length)) scrollToBottom();
  }, [mapBackendMsg, scrollToBottom]);

  const handleManualDefer = useCallback((clientMessageId: string) => {
              void deferTextExchangeManually(
                clientMessageId,
                MANUAL_OUTBOX_CONFIRMATION,
              ).then(() => {
                if (outboxRetryTimerRef.current) {
                  clearTimeout(outboxRetryTimerRef.current);
                  outboxRetryTimerRef.current = null;
                }
                setMessages((previous) => previous.map((message) =>
                  message.client_message_id === clientMessageId
                    ? {
                        ...message,
                        meta: {
                          ...(message.meta ?? {}),
                          exchange_status: "queued_by_user",
                          durable_outbox: true,
                        },
                      }
                    : message
                ));
              }).catch((error) => {
                setProcessingNotice({ kind: "terminal_failure", clientMessageId, errorCode: "manual_defer_failed" });
              });
  }, []);

  const scheduleNextOutboxDrain = useCallback(async () => {
    if (outboxRetryTimerRef.current) {
      clearTimeout(outboxRetryTimerRef.current);
      outboxRetryTimerRef.current = null;
    }
    const nextAttemptAt = await nextTextOutboxAttemptAt();
    if (nextAttemptAt === null) return;
    const delay = Math.max(250, Math.min(30_000, nextAttemptAt - Date.now()));
    outboxRetryTimerRef.current = setTimeout(() => {
      outboxRetryTimerRef.current = null;
      window.dispatchEvent(new CustomEvent("kael-outbox-retry"));
    }, delay);
  }, []);
  const refreshOutboxSummary = useCallback(async () => {
    const summary = await getTextOutboxSummary();
    setOutboxSummary(summary);
    return summary;
  }, []);

  const runTextOutboxDrain = useCallback(async (trigger: TextOutboxDrainTrigger = "automatic"): Promise<TextOutboxDrainResult[]> => {
    if (!continuityReady || lifecycleState !== "online") return [];
    try {
      const results = await drainTextOutbox({ trigger });
      applyOutboxResults(results);
      await refreshOutboxSummary();
      await scheduleNextOutboxDrain();
      return results;
    } catch (error) {
      // Transport failures are classified and retained by drainTextOutbox.
      // Reaching this branch means the local durable continuity contract itself
      // failed; stop new sends until a fresh boot can recover IndexedDB.
      const name = error instanceof Error ? error.name : "unknown";
      emitTelemetry("chatContinuity.failed", { error: name });
      setContinuityError("Archivio durevole chat non disponibile");
      setContinuityReady(false);
      setProcessingNotice((current) => ({ ...current, kind: "unconfirmed" }));
      throw error;
    }
  }, [continuityReady, lifecycleState, applyOutboxResults, refreshOutboxSummary, scheduleNextOutboxDrain]);

  // Boot/online and explicit retry triggers all converge on the same module-level
  // single-flight FIFO drain. No lifecycle event can start a parallel text send.
  useEffect(() => {
    const online = continuityReady && lifecycleState === "online";
    const reconnected = online && !outboxOnlineRef.current;
    outboxOnlineRef.current = online;
    if (!online) return;
    const retry = () => { runTextOutboxDrain().catch(() => {}); };
    window.addEventListener("kael-outbox-retry", retry);
    runTextOutboxDrain(reconnected ? "reconnect" : "automatic").catch(() => {});
    if (timelineReady) fetchAndAppendPending().catch(() => {});
    return () => window.removeEventListener("kael-outbox-retry", retry);
  }, [continuityReady, timelineReady, lifecycleState, runTextOutboxDrain, fetchAndAppendPending]);

  useEffect(() => () => {
    if (outboxRetryTimerRef.current) clearTimeout(outboxRetryTimerRef.current);
  }, []);

  // Visibility resume catch-up (moved here from above the fetchAndAppendPending
  // declaration to avoid TDZ in minified prod bundle — see note above).
  useEffect(() => {
    if (lifecycleState !== "online") return;
    const handleResume = () => {
      if (document.visibilityState === "visible") {
        void recoverTimeline().catch(() => {});
        runTextOutboxDrain("resume").catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleResume);

    // K-2 (2026-05-19): Capacitor appStateChange — fires more reliably on Android
    // than visibilitychange when app returns to foreground. Resets the history
    // bootstrap when necessary, using the same recovery owner as reconnect.
    let capListener: { remove: () => void } | null = null;
    let disposed = false;
    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive || disposed) return;
      void recoverTimeline().catch(() => {});
      runTextOutboxDrain("resume").catch(() => {});
    }).then((listener) => {
      if (disposed) void listener.remove();
      else capListener = listener;
    }).catch(() => {});

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleResume);
      capListener?.remove();
    };
  }, [lifecycleState, recoverTimeline, runTextOutboxDrain]);

  useEffect(() => {
    if (lifecycleState !== "online") return;

    const handleAutonomous = () => {
      void recoverTimeline().catch(() => {});
    };

    const handleReconnect = () => {
      // Catch up on any messages missed while disconnected
      void recoverTimeline().catch(() => {});
      runTextOutboxDrain("reconnect").catch(() => {});
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
      historyRecoveryRef.current.invalidate();
      pendingRecoveryRef.current.invalidate();
      historyLoadedRef.current = false;
      pendingDrainReadyRef.current = false;
      setTimelineReady(false);
      void recoverTimeline().catch(() => {});
    };

    window.addEventListener("kael-new-message", handleAutonomous);
    window.addEventListener("kael-sse-connected", handleReconnect);
    window.addEventListener("kael-server-restarted", handleServerRestarted);
    return () => {
      window.removeEventListener("kael-new-message", handleAutonomous);
      window.removeEventListener("kael-sse-connected", handleReconnect);
      window.removeEventListener("kael-server-restarted", handleServerRestarted);
    };
  }, [lifecycleState, recoverTimeline, runTextOutboxDrain]);

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
      if (!continuityReady) {
        toast.error(continuityError ?? "Archivio durevole chat non ancora pronto");
        return;
      }

      const quotedSnapshot = quotedMessagePayload;
      let exchange;
      try {
        // This transaction is the acceptance boundary: no optimistic UI and no
        // HTTP request exist until the exact body has been durably committed.
        exchange = await enqueueTextExchange({
          timelineKey: DEFAULT_CONVERSATION_ID,
          sessionId,
          text,
          quotedMessage: quotedSnapshot,
        });
        await refreshOutboxSummary();
      } catch {
        toast.error("Messaggio non inviato: impossibile salvarlo nell'outbox durevole");
        return;
      }

      const clientMsgId = exchange.clientMessageId;
      const userMsg: ChatMessage = {
        id: clientMsgId,
        text: exchange.requestBody.text,
        time: new Date(exchange.createdAtMs).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
        timestamp: exchange.createdAtMs / 1000,
        sender: "user",
        feedback: null,
        client_message_id: clientMsgId,
        meta: { exchange_status: "queued", durable_outbox: true },
      };
      setMessages((previous) => {
        const editingIndex = previous.findIndex((message) => message.isEditing);
        const retained = editingIndex >= 0 ? previous.slice(0, editingIndex) : previous;
        return mergeMessagesIdempotent(retained, [userMsg]);
      });
      setQuotedPreview(null);
      setQuotedMessagePayload(null);
      scrollToBottom();

      setProcessingNotice({ kind: "waiting", clientMessageId: clientMsgId });
      try {
        const results = await runTextOutboxDrain();
        const ownResult = results.find((result) => result.clientMessageId === clientMsgId);
        if (!ownResult) setProcessingNotice((current) => current?.clientMessageId === clientMsgId
          ? { ...current, kind: "unconfirmed" } : current);
        if (agentMode && (ownResult?.kind === "reply" || ownResult?.kind === "replay")) {
          try {
            const agentHistory: ExternalChatMessage[] = [...messages, userMsg]
              .filter((m) => m.sender === "user" || m.sender === "external_agent")
              .slice(-20)
              .map((m) => ({
                role: m.sender === "user" ? "user" as const : "assistant" as const,
                content: m.text,
              }));

            const model = getSelectedModel();
            const external = await sendExternalAgentMessage(agentHistory, {
              exchangeId: `external:${clientMsgId}`,
              sessionId,
            });
            const receivedAt = external.observation.provenance.received_at;

            const agentMsg: ChatMessage = {
              id: `external-${external.turn_id}`,
              text: external.reply,
              time: new Date(receivedAt * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
              timestamp: receivedAt,
              sender: "external_agent",
              feedback: null,
              backend_turn_id: String(external.turn_id),
              agent_id: external.observation.provenance.agent_id,
              agent_name: `${model.providerLabel} · ${model.label}`,
              meta: {
                ...external.observation.provenance,
                observation_id: external.observation.observation_id,
                epistemic_status: "attributed_claim_not_verified_truth",
                idempotent_replay: external.replayed,
              },
            };
            setMessages((prev) => mergeMessagesIdempotent(prev, [agentMsg]));
            scrollToBottom();
          } catch (error) {
            console.warn("[Chat] External agent unavailable:", error);
          }
        }
      } catch {
        setProcessingNotice((current) => current?.clientMessageId === clientMsgId
          ? { ...current, kind: "transport_deferred" } : current);
        // The exact envelope remains in IndexedDB. Reconnect/boot retries the
        // same logical request; never synthesize a second UUID here.
        // The top error surface presents this retained transport failure.
        probeAndResolveBackend().catch(() => {});
      }
    },
    [
      sessionId,
      agentMode,
      messages,
      continuityReady,
      continuityError,
      quotedMessagePayload,
      refreshOutboxSummary,
      runTextOutboxDrain,
      scrollToBottom,
    ]
  );

  const handleSwipeReply = useCallback((message: ChatMessage) => {
    const authorLabel =
      message.sender === "user"
        ? "te"
        : message.sender === "external_agent"
          ? (message.agent_name || "External Agent")
          : "Arrakis";
    const sourceText =
      message.text?.trim() ||
      message.bubbles?.[0]?.trim() ||
      (message.image ? "[Immagine]" : "[Messaggio]");

    const quotedAuthor: QuotedMessagePayload["quoted_author"] =
      message.sender === "user"
        ? "user"
        : (String(message.meta?.autonomy_source || "").toLowerCase() === "autonomy" ||
            String(message.meta?.source || "").toLowerCase() === "autonomy")
          ? "autonomous"
          : "assistant";
    const createdAt =
      typeof message.timestamp === "number" && Number.isFinite(message.timestamp)
        ? new Date(message.timestamp * 1000).toISOString()
        : new Date().toISOString();

    setQuotedMessagePayload({
      quoted_message_id: message.id,
      quoted_turn_id: message.backend_turn_id ?? null,
      quoted_session_id: sessionId,
      quoted_author: quotedAuthor,
      quoted_channel: "chat",
      quoted_created_at: createdAt,
      quoted_text_preview: sourceText.slice(0, 240),
      quoted_text_hash: null,
      quoted_full_text_available: Boolean(message.text?.trim() || message.bubbles?.length),
      quoted_autonomy_id:
        typeof message.meta?.autonomy_id === "string"
          ? message.meta.autonomy_id
          : null,
      quoted_parent_message_id: null,
      quoted_topic_id:
        typeof message.meta?.topic_id === "string"
          ? message.meta.topic_id
          : null,
      quoted_memory_candidate: null,
    });

    setQuotedPreview({
      authorLabel,
      textPreview: sourceText.slice(0, 160),
    });
    toast.success("Messaggio selezionato per risposta");
  }, [sessionId]);

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

        setProcessingNotice({ kind: "waiting", clientMessageId: clientMsgId });
        try {
          const startTime = Date.now();
          const response = await chatApi.sendImage(file, sessionId, caption);
          const latency = Date.now() - startTime;

          // Warn user if vision failed (Kael replied without seeing the image)
          if (response.vision_ok === false && response.failure_kind) {
            const failureKind = response.failure_kind;
            const visionErrorMsgs: Record<string, string> = {
              not_configured: "La visione non è configurata — assicurati che Moondream sia installato in Ollama",
              ollama_unreachable: "Ollama non è raggiungibile",
              moondream_error: "Arrakis non è riuscito ad analizzare l'immagine",
              empty_response: "Moondream ha restituito una risposta vuota",
            };
            const msg = Object.entries(visionErrorMsgs).find(([key]) =>
              failureKind.startsWith(key)
            )?.[1] ?? "Visione non disponibile";
            toast.warning(msg);
          }

          // Assign backend_turn_id to the user image message so it persists across reloads
          const userTurnId = response.user_turn_id;
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
          if (!normalizedReply.text && !response.image_base64) {
            setProcessingNotice((current) => current?.clientMessageId === clientMsgId
              ? { ...current, kind: "unconfirmed" } : current);
            return;
          }
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
            // Image generation: if backend generated an image, embed it.
            image: response.image_base64
              ? `data:${response.image_mime ?? "image/png"};base64,${response.image_base64}`
              : undefined,
            agent_id: response.agent_id,
            agent_name: response.agent_name,
            agent_avatar: response.agent_avatar,
          };
          setMessages((prev) => mergeMessagesIdempotent(prev, [responseMsg]));
          setProcessingNotice((current) => current?.clientMessageId === clientMsgId
            ? response.error == null && /^[1-9]\d*$/.test(assistantIdentity.backendTurnId ?? "")
              ? null : { ...current, kind: "unconfirmed" }
            : current);
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
          setProcessingNotice((current) => current?.clientMessageId === clientMsgId
            ? { ...current, kind: "unconfirmed" } : current);
          const isTimeout =
            error instanceof Error &&
            (error.name === "AbortError" || error.message.includes("timeout"));
          if (isTimeout) {
            toast.warning("Il server non ha confermato un esito per l'immagine", { duration: 6000 });
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
    [sessionId, fetchAndAppendPending, normalizeAssistantPayload, scrollToBottom]
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

      setProcessingNotice({ kind: "waiting", clientMessageId });
      try {
        const startTime = Date.now();
        const response = await chatApi.sendVoiceNote(blob, sessionId, clientMessageId);
        const latency = Date.now() - startTime;

        const presentation = voiceNoteReceiptPresentation(response);
        if (presentation === "non_assistant") {
          setProcessingNotice((current) => current?.clientMessageId === clientMessageId
            ? { ...current, kind: "unconfirmed" } : current);
          // A technical receipt is not an assistant turn. Reconcile only;
          // never re-send the audio or manufacture a response card.
          setTimeout(() => fetchAndAppendPending(), 5000);
          return;
        }

        // ACK: Update the optimistic message with the backend turn ID
        if (response.user_turn_id != null) {
          setMessages((prev) =>
            prev.map((m) =>
              m.client_message_id === clientMessageId
                ? {
                    ...m,
                    backend_turn_id: String(response.user_turn_id),
                    meta: {
                      ...(m.meta ?? {}),
                      exchange_status: response.exchange_status,
                      outcome_kind: response.outcome_kind,
                    },
                  }
                : m
            )
          );
        }

        if (presentation === "silence") {
          setProcessingNotice((current) => current?.clientMessageId === clientMessageId
            ? { ...current, kind: "silence" } : current);
          return;
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
        if (!normalizedReply.text) {
          setProcessingNotice((current) => current?.clientMessageId === clientMessageId
            ? { ...current, kind: "unconfirmed" } : current);
          return;
        }
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
          delivery_mode:
            response.input_mode === "voice_note"
              ? "voice_note"
              : undefined,
          // Image generation: if backend generated an image, embed it.
          image: response.image_base64
            ? `data:${response.image_mime ?? "image/png"};base64,${response.image_base64}`
            : undefined,
          agent_id: response.agent_id,
          agent_name: response.agent_name,
          agent_avatar: response.agent_avatar,
        };
        setMessages((prev) => mergeMessagesIdempotent(prev, [responseMsg]));
        setProcessingNotice((current) => current?.clientMessageId === clientMessageId ? null : current);
        scrollToBottom();
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
        setProcessingNotice((current) => current?.clientMessageId === clientMessageId
          ? { ...current, kind: "unconfirmed" } : current);
        toast.error(error instanceof Error ? error.message : "Failed to send voice note");
        // Reconcile: fetch pending in case backend completed after timeout
        setTimeout(() => fetchAndAppendPending(), 5000);
      }
    },
    [sessionId, fetchAndAppendPending, normalizeAssistantPayload, scrollToBottom]
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

  const handlePlayNativeVoice = useCallback(async (message: ChatMessage) => {
    const turnId = Number(message.backend_turn_id);
    if (!Number.isSafeInteger(turnId) || turnId < 1) {
      toast.error("Vocale canonico non disponibile");
      return;
    }
    const attempt = ++nativeVoiceAttemptRef.current;
    try {
      await nativeCallVoiceService.stop();
      if (attempt !== nativeVoiceAttemptRef.current) return;
      setNativeVoicePlayback({ turnId, state: "starting" });
      const playback = nativeCallVoiceService.playAssistantTurn(turnId, sessionId);
      setNativeVoicePlayback({ turnId, state: "playing" });
      await playback;
      if (attempt === nativeVoiceAttemptRef.current) {
        setNativeVoicePlayback({ turnId: null, state: "idle" });
      }
    } catch (error) {
      if (attempt !== nativeVoiceAttemptRef.current) return;
      setNativeVoicePlayback({ turnId, state: "failed" });
      toast.error(
        error instanceof Error && error.message === "AUDIO_PLAYER_BUSY"
          ? "Un altro vocale è già in riproduzione"
          : "Riproduzione vocale non riuscita",
      );
    }
  }, [sessionId]);

  const handleStopNativeVoice = useCallback(async () => {
    nativeVoiceAttemptRef.current += 1;
    setNativeVoicePlayback({ turnId: null, state: "idle" });
    await nativeCallVoiceService.stop();
  }, []);

  useEffect(() => () => {
    nativeVoiceAttemptRef.current += 1;
    void nativeCallVoiceService.stop();
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

  const handleManualOutboxRetry = useCallback(async (clientMessageId: string) => {
    const entry = outboxSummary.attention.find((item) => item.clientMessageId === clientMessageId);
    if (!entry) return;
    if (!window.confirm("Vuoi riprovare lo stesso invio?")) return;

    setOutboxActionBusy(clientMessageId);
    try {
      await retryTextExchangeManually(
        clientMessageId,
        MANUAL_OUTBOX_CONFIRMATION,
      );
      await refreshOutboxSummary();
      await runTextOutboxDrain("explicit_retry");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry manuale non riuscito");
    } finally {
      await refreshOutboxSummary().catch(() => {});
      setOutboxActionBusy(null);
    }
  }, [outboxSummary.attention, refreshOutboxSummary, runTextOutboxDrain]);

  const handleManualOutboxRemove = useCallback(async (clientMessageId: string) => {
    const entry = outboxSummary.attention.find((item) => item.clientMessageId === clientMessageId);
    if (!entry) return;
    if (!window.confirm(
      "Annullare questo invio in attesa? I messaggi già salvati rimangono nella cronologia.",
    )) return;

    setOutboxActionBusy(clientMessageId);
    try {
      await removeTextExchangeManually(
        clientMessageId,
        MANUAL_OUTBOX_CONFIRMATION,
      );
      setMessages((previous) => previous.filter((message) =>
        message.client_message_id !== clientMessageId
      ));
      await refreshOutboxSummary();
      await runTextOutboxDrain();
      fetchAndAppendPending().catch(() => {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rimozione manuale non riuscita");
    } finally {
      await refreshOutboxSummary().catch(() => {});
      setOutboxActionBusy(null);
    }
  }, [
    fetchAndAppendPending,
    outboxSummary.attention,
    refreshOutboxSummary,
    runTextOutboxDrain,
  ]);

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
        title="Arrakis"
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

      {continuityReady && <OutboxAttentionPanel
        summary={outboxSummary}
        busyClientMessageId={outboxActionBusy}
        onRetry={handleManualOutboxRetry}
        onRemove={handleManualOutboxRemove}
      />}

      <ChatProcessingNotice state={outboxSummary.attention.length || outboxSummary.total >= outboxSummary.capacity ? null : processingNotice} onDefer={handleManualDefer} />

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

        {!historyLoading && messages.length === 0 && timelineError && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-muted-foreground">
            <p>Cronologia non disponibile.</p>
            <button type="button" onClick={() => void loadHistory()} className="rounded-lg border border-border px-3 py-2">Riprova caricamento</button>
          </div>
        )}

        {!historyLoading && messages.length === 0 && !timelineError && (
          <div className="flex flex-col items-center justify-center h-full opacity-60 text-center px-8">
            <img src={kaelAvatarSrc} alt="Arrakis" className="h-16 w-16 rounded-full object-contain mb-4 opacity-90" />
            <p className="text-sm text-muted-foreground">Scrivi un messaggio per iniziare.</p>
            <p className="text-[10px] text-muted-foreground/50 mt-2">Tieni premuto sullo sfondo per personalizzarlo</p>
          </div>
        )}

        {messages.map((msg) => {
          const pendingSend = msg.sender === "user" && outboxSummary.attention.find(
            (entry) => entry.clientMessageId === msg.client_message_id,
          );
          return (
          <MessageBubble
            key={msg.id}
            message={msg}
            onLike={(id) => handleFeedback(id, "like")}
            onDislike={(id) => handleFeedback(id, "dislike")}
            onPlayTTS={handlePlayNativeVoice}
            nativeVoiceState={
              nativeVoicePlayback.turnId === Number(msg.backend_turn_id)
                ? nativeVoicePlayback.state
                : "idle"
            }
            onPlayNativeVoice={handlePlayNativeVoice}
            onStopNativeVoice={() => void handleStopNativeVoice()}
            onImageClick={setViewerImage}
            onImageLoad={handleGeneratedImageLoad}
            onEditMessage={handleEditMessage}
            onRetrySend={pendingSend ? () => void handleManualOutboxRetry(pendingSend.clientMessageId) : undefined}
            onCancelSend={pendingSend ? () => void handleManualOutboxRemove(pendingSend.clientMessageId) : undefined}
            sendActionBusy={Boolean(pendingSend && outboxActionBusy === pendingSend.clientMessageId)}
            onSwipeReply={handleSwipeReply}
            wallpaperStyle={bubbleWallpaperStyle}
          />
          );
        })}
        <ChatTypingDots />

        <div ref={messagesEndRef} />
      </div>


      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onImageUpload={handleImageUpload}
        onVoiceNote={handleVoiceNote}
        onOpenServices={() => navigate("/workspace")}
        onCancelEdit={handleCancelEdit}
        quotedMessagePreview={quotedPreview}
        onClearQuotedMessage={() => {
          setQuotedPreview(null);
          setQuotedMessagePayload(null);
        }}
        disabled={lifecycleState !== "online" || !continuityReady || Boolean(continuityError)}
        sessionId={sessionId}
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

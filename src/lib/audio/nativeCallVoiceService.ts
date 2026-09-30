import { getApiConfig } from "@/lib/api/client";
import {
  NativePcmPlayer,
  type NativePcmFrame,
  type NativePlayoutReport,
  type NativeVoiceBinding,
} from "./nativePcmPlayer";

const FRAME_HEADER_BYTES = 12;
const TERMINAL_SEQUENCE = 0xffffffff;
const MAX_PCM_BYTES = 720000 * 2;
const MAX_WIRE_BYTES = MAX_PCM_BYTES + 4097 * FRAME_HEADER_BYTES;

interface ActiveVoice {
  abort: AbortController;
  player: NativePcmPlayer;
  binding: NativeVoiceBinding;
  sessionId: string;
  stoppedByUser: boolean;
}

export interface AssistantSpeechRequest {
  path: string;
  options: RequestInit & { timeout: number };
}

/** Build the bounded presentation request without accepting any client text. */
export function createAssistantSpeechRequest(
  assistantTurnId: number,
  sessionId: string,
  callId?: string,
  signal?: AbortSignal,
): AssistantSpeechRequest {
  const canonicalCallId = callId?.trim();
  if (
    !Number.isSafeInteger(assistantTurnId) || assistantTurnId < 1 || !sessionId.trim() ||
    (callId !== undefined && (!canonicalCallId || canonicalCallId.length > 128))
  ) {
    throw new Error("AUDIO_STREAM_REQUEST_INVALID");
  }
  const query = new URLSearchParams({ session_id: sessionId });
  if (canonicalCallId !== undefined) query.set("call_id", canonicalCallId);
  return {
    path: `/audio/speech/${assistantTurnId}?${query.toString()}`,
    options: {
      method: "POST",
      timeout: 15_000,
      ...(signal ? { signal } : {}),
    },
  };
}

function requiredHeader(response: Response, name: string): string {
  const value = response.headers.get(name);
  if (!value) throw new Error("AUDIO_STREAM_BINDING_INVALID");
  return value;
}

function parseSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("AUDIO_STREAM_BINDING_INVALID");
  }
  return parsed;
}

export async function validateAssistantSpeechResponse(
  response: Response,
  expectedCallId?: string,
): Promise<{ response: Response; binding: NativeVoiceBinding }> {
  try {
    if (
      response.headers.get("X-Arrakis-Audio-Protocol") !== "arrakis_pcm_frames_v1" ||
      response.headers.get("X-Arrakis-Sample-Rate") !== "24000" ||
      response.headers.get("X-Arrakis-Channels") !== "1" ||
      response.headers.get("X-Arrakis-Encoding") !== "pcm_s16le"
    ) {
      throw new Error("AUDIO_STREAM_PROTOCOL_UNSUPPORTED");
    }
    if (
      expectedCallId !== undefined &&
      response.headers.get("X-Arrakis-Call-Id") !== expectedCallId
    ) {
      throw new Error("AUDIO_STREAM_CALL_BINDING_INVALID");
    }
    const binding: NativeVoiceBinding = {
      deliveryId: requiredHeader(response, "X-Arrakis-Delivery-Id"),
      utteranceId: requiredHeader(response, "X-Arrakis-Utterance-Id"),
      epoch: parseSafeInteger(requiredHeader(response, "X-Arrakis-Epoch")),
      speechPlanSha256: requiredHeader(response, "X-Arrakis-Speech-Plan-SHA256"),
    };
    if (!/^[a-f0-9]{64}$/.test(binding.speechPlanSha256)) {
      throw new Error("AUDIO_STREAM_BINDING_INVALID");
    }
    if (!response.body) throw new Error("AUDIO_STREAM_BODY_UNAVAILABLE");
    return { response, binding };
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
}

async function authenticatedFetch(
  path: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const config = getApiConfig();
  if (!config.baseUrl) throw new Error("Backend URL not configured");
  const abort = new AbortController();
  if (options.signal?.aborted) abort.abort();
  else options.signal?.addEventListener("abort", () => abort.abort(), { once: true });
  const timeout = setTimeout(() => abort.abort(), options.timeout ?? 15_000);
  const headers = new Headers(options.headers);
  if (config.apiKey) headers.set("X-KAEL-KEY", config.apiKey);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
      ...options,
      headers,
      signal: abort.signal,
    });
    if (!response.ok) {
      // Error bodies may contain private transport detail; diagnostics remain
      // metadata-only at this media boundary.
      await response.body?.cancel().catch(() => {});
      throw new Error(`AUDIO_HTTP_${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Presents only a committed Arrakis assistant turn. It accepts no text and
 * therefore cannot become another speaker, prompt path, or voice authority.
 */
export class NativeCallVoiceService {
  private active: ActiveVoice | null = null;
  private pendingAbort: AbortController | null = null;
  private pendingStoppedByUser = false;

  async playAssistantTurn(
    assistantTurnId: number,
    sessionId: string,
    callId?: string,
  ): Promise<void> {
    const canonicalCallId = callId?.trim();
    const request = createAssistantSpeechRequest(
      assistantTurnId, sessionId, canonicalCallId,
    );
    if (this.active || this.pendingAbort) throw new Error("AUDIO_PLAYER_BUSY");

    const abort = new AbortController();
    this.pendingStoppedByUser = false;
    this.pendingAbort = abort;
    const transport = authenticatedFetch(request.path, {
      ...request.options,
      signal: abort.signal,
    }).then((response) => validateAssistantSpeechResponse(response, canonicalCallId));

    let player: NativePcmPlayer | null = null;
    let binding: NativeVoiceBinding | null = null;
    try {
      player = await NativePcmPlayer.open(
        transport.then((result) => result.binding),
        async (report) => {
          const reportBinding = (await transport).binding;
          await this.persistReport(reportBinding, sessionId, report);
        },
      );
      const result = await transport;
      binding = result.binding;
      this.pendingAbort = null;
      this.active = { abort, player, binding, sessionId, stoppedByUser: false };
      const consumption = this.consume(result.response.body!, player, binding);
      // If the worklet deadline or receipt boundary fails while the HTTP body
      // is stalled, leave reader.read() and enter the abort/cleanup path.
      void consumption.catch(() => {});
      await Promise.race([consumption, player.terminal]);
      await consumption;
      await player.receiptDelivery;
      await player.closed;
    } catch (error) {
      abort.abort();
      if (!binding) {
        try { binding = (await transport).binding; } catch { /* no durable binding */ }
      }
      if (player) {
        try { await player.stop(); } catch { /* terminal may already be failed */ }
      }
      if (binding) await this.interruptRemote(binding.deliveryId);
      const stoppedByUser = this.pendingStoppedByUser || (
        binding != null && this.active?.binding.deliveryId === binding.deliveryId &&
        this.active.stoppedByUser
      );
      if (!stoppedByUser) throw error;
    } finally {
      if (this.pendingAbort === abort) this.pendingAbort = null;
      this.pendingStoppedByUser = false;
      if (binding && this.active?.binding.deliveryId === binding.deliveryId) this.active = null;
    }
  }

  async stop(): Promise<void> {
    const current = this.active;
    if (!current) {
      this.pendingStoppedByUser = true;
      this.pendingAbort?.abort();
      return;
    }
    current.stoppedByUser = true;
    const terminal = current.player.stop();
    current.abort.abort();
    await this.interruptRemote(current.binding.deliveryId);
    try { await terminal; } catch { /* the caller observes the play attempt */ }
    try { await current.player.receiptDelivery; } catch { /* backend owns diagnostics */ }
  }

  private async consume(
    body: ReadableStream<Uint8Array>,
    player: NativePcmPlayer,
    binding: NativeVoiceBinding,
  ): Promise<void> {
    const reader = body.getReader();
    let pending = new Uint8Array(0);
    let wireBytes = 0;
    let expectedSequence = 0;
    let expectedSample = 0;
    let terminal = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.byteLength || terminal) throw new Error("AUDIO_STREAM_FRAME_INVALID");
        wireBytes += value.byteLength;
        if (wireBytes > MAX_WIRE_BYTES) throw new Error("AUDIO_STREAM_TOO_LARGE");
        const combined = new Uint8Array(pending.byteLength + value.byteLength);
        combined.set(pending);
        combined.set(value, pending.byteLength);
        pending = combined;

        let offset = 0;
        while (pending.byteLength - offset >= FRAME_HEADER_BYTES) {
          const header = new DataView(pending.buffer, pending.byteOffset + offset, FRAME_HEADER_BYTES);
          const sequence = header.getUint32(0, false);
          const sampleStart = header.getUint32(4, false);
          const payloadBytes = header.getUint32(8, false);
          if (sequence === TERMINAL_SEQUENCE) {
            if (
              payloadBytes !== 0 || sampleStart !== expectedSample ||
              pending.byteLength - offset !== FRAME_HEADER_BYTES
            ) {
              throw new Error("AUDIO_STREAM_TERMINAL_INVALID");
            }
            terminal = true;
            offset += FRAME_HEADER_BYTES;
            await player.finish(expectedSample);
            break;
          }
          if (
            payloadBytes < 2 || payloadBytes > 4800 || payloadBytes % 2 ||
            sequence !== expectedSequence || sampleStart !== expectedSample
          ) {
            throw new Error("AUDIO_STREAM_FRAME_INVALID");
          }
          if (pending.byteLength - offset < FRAME_HEADER_BYTES + payloadBytes) break;
          const pcm = pending.slice(
            offset + FRAME_HEADER_BYTES,
            offset + FRAME_HEADER_BYTES + payloadBytes,
          ).buffer;
          const frame: NativePcmFrame = {
            utteranceId: binding.utteranceId,
            epoch: binding.epoch,
            sequence,
            sampleStart,
            pcmS16le: pcm,
          };
          await player.feed(frame);
          expectedSequence++;
          expectedSample += payloadBytes / 2;
          offset += FRAME_HEADER_BYTES + payloadBytes;
        }
        pending = pending.slice(offset);
      }
      if (!terminal || pending.byteLength) throw new Error("AUDIO_STREAM_INCOMPLETE");
      await player.terminal;
    } finally {
      reader.releaseLock();
    }
  }

  private async persistReport(
    binding: NativeVoiceBinding,
    sessionId: string,
    report: NativePlayoutReport,
  ): Promise<void> {
    await authenticatedFetch(
      `/audio/speech/${encodeURIComponent(binding.deliveryId)}/playout?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Arrakis-Speech-Plan-SHA256": binding.speechPlanSha256,
        },
        body: JSON.stringify(report),
        timeout: 10_000,
      },
    );
  }

  private async interruptRemote(deliveryId: string): Promise<void> {
    try {
      await authenticatedFetch(`/audio/speech/${encodeURIComponent(deliveryId)}/interrupt`, {
        method: "POST",
        timeout: 5000,
      });
    } catch {
      // Local silence already happened; the server's deadline is independent.
    }
  }
}

export const nativeCallVoiceService = new NativeCallVoiceService();

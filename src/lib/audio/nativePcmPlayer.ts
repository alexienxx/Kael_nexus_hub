/**
 * Bounded native PCM sink for one canonical Arrakis speech delivery.
 * Reports AudioWorklet consumption only; it never claims that audio was heard.
 */
export interface NativeVoiceBinding {
  deliveryId: string;
  utteranceId: string;
  epoch: number;
}

export interface NativePlayoutReport {
  sequence: number;
  played_sample_boundary: number;
  status: "playing" | "completed" | "interrupted" | "failed";
  measured_at: string;
  measurement_method: "audio_worklet_render_quantum";
  discontinuity: boolean;
}

export interface NativePcmFrame {
  utteranceId: string;
  epoch: number;
  sequence: number;
  sampleStart: number;
  pcmS16le: ArrayBuffer;
}

export class NativePcmPlayer {
  private static occupied = false;
  private context!: AudioContext;
  private node!: AudioWorkletNode;
  private gain!: GainNode;
  private capacity = 9600;
  private frameSlots = 4;
  private received = 0;
  private nextFrame = 0;
  private nextReport = 0;
  private lastBoundary = 0;
  private discontinuity = false;
  private final = false;
  private sealed = false;
  private feeding = false;
  private stopping = false;
  private receiptChain: Promise<void> = Promise.resolve();
  private pendingReceipts = 0;
  private wake: (() => void) | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private released = false;
  private resolveTerminal!: (report: NativePlayoutReport) => void;
  private rejectTerminal!: (error: Error) => void;
  private resolveClosed!: () => void;
  private rejectClosed!: (error: Error) => void;
  readonly terminal: Promise<NativePlayoutReport>;
  readonly closed: Promise<void>;

  private constructor(
    readonly binding: Readonly<NativeVoiceBinding>,
    private readonly onReport: (report: NativePlayoutReport) => void | Promise<void>,
  ) {
    this.terminal = new Promise((resolve, reject) => {
      this.resolveTerminal = resolve;
      this.rejectTerminal = reject;
    });
    this.closed = new Promise((resolve, reject) => {
      this.resolveClosed = resolve;
      this.rejectClosed = reject;
    });
    void this.terminal.catch(() => {});
    void this.closed.catch(() => {});
  }

  static async open(
    bindingInput: NativeVoiceBinding | Promise<NativeVoiceBinding>,
    onReport: (report: NativePlayoutReport) => void | Promise<void>,
  ): Promise<NativePcmPlayer> {
    if (NativePcmPlayer.occupied) throw new Error("AUDIO_PLAYER_BUSY");
    NativePcmPlayer.occupied = true;
    let context: AudioContext | null = null;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      context = new AudioContext({ sampleRate: 24000, latencyHint: "interactive" });
      const resumed = context.resume();
      const [binding] = await Promise.race([
        Promise.all([
          Promise.resolve(bindingInput),
          resumed,
          context.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio/arrakis-pcm-worklet.js`),
        ]),
        new Promise<never>((_, reject) => {
          startupTimer = setTimeout(
            () => reject(new Error("AUDIO_PLAYER_START_TIMEOUT")),
            10_000,
          );
        }),
      ]);
      if (
        typeof binding.deliveryId !== "string" || !binding.deliveryId ||
        typeof binding.utteranceId !== "string" ||
        !/^[A-Za-z0-9_.:-]{1,96}$/.test(binding.utteranceId) ||
        !Number.isSafeInteger(binding.epoch) || binding.epoch < 0
      ) {
        throw new Error("AUDIO_PLAYER_BINDING_INVALID");
      }
      if (context.sampleRate !== 24000 || context.state !== "running") {
        throw new Error("AUDIO_PLAYER_CONTEXT_UNAVAILABLE");
      }
      const player = new NativePcmPlayer(Object.freeze({ ...binding }), onReport);
      player.context = context;
      player.node = new AudioWorkletNode(player.context, "arrakis-pcm-v1", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: binding,
      });
      player.gain = player.context.createGain();
      player.node.connect(player.gain).connect(player.context.destination);
      player.node.port.onmessage = ({ data }) => player.onMessage(data);
      player.node.onprocessorerror = () => player.fail("AUDIO_PLAYER_PROCESSOR_FAILED");
      player.deadline = setTimeout(() => player.fail("AUDIO_PLAYER_DEADLINE"), 45_000);
      return player;
    } catch (error) {
      let closeConfirmed = !context || context.state === "closed";
      if (context && context.state !== "closed") {
        try {
          await context.close();
          closeConfirmed = true;
        } catch {
          console.error("AUDIO_PLAYER_CLOSE_UNCONFIRMED");
        }
      }
      if (!closeConfirmed) throw new Error("AUDIO_PLAYER_CLOSE_UNCONFIRMED");
      NativePcmPlayer.occupied = false;
      throw error;
    } finally {
      if (startupTimer) clearTimeout(startupTimer);
    }
  }

  async feed(frame: NativePcmFrame): Promise<void> {
    if (this.feeding) throw new Error("AUDIO_PLAYER_CONCURRENT_FEED");
    if (this.final || this.sealed || this.stopping) throw new Error("AUDIO_PLAYER_CLOSED");
    if (frame.utteranceId !== this.binding.utteranceId || frame.epoch !== this.binding.epoch) {
      throw new Error("AUDIO_PLAYER_STALE_FRAME");
    }
    const bytes = frame.pcmS16le;
    if (
      this.nextFrame >= 4096 || frame.sequence !== this.nextFrame ||
      frame.sampleStart !== this.received || !(bytes instanceof ArrayBuffer) ||
      !bytes.byteLength || bytes.byteLength % 2 || bytes.byteLength > 4800 ||
      this.received + bytes.byteLength / 2 > 720000
    ) {
      this.fail("AUDIO_PLAYER_FRAME_INVALID");
      throw new Error("AUDIO_PLAYER_FRAME_INVALID");
    }
    this.feeding = true;
    try {
      const count = bytes.byteLength / 2;
      const view = new DataView(bytes);
      const pcm = new Int16Array(count);
      for (let index = 0; index < count; index++) pcm[index] = view.getInt16(index * 2, true);
      const sequence = frame.sequence;
      const sampleStart = frame.sampleStart;
      while ((this.capacity < count || !this.frameSlots) && !this.final && !this.stopping) {
        await new Promise<void>((resolve) => { this.wake = resolve; });
      }
      if (this.final || this.stopping) throw new Error("AUDIO_PLAYER_CLOSED");
      this.capacity -= count;
      this.frameSlots--;
      this.received += count;
      this.nextFrame++;
      this.node.port.postMessage({
        kind: "pcm",
        utteranceId: this.binding.utteranceId,
        epoch: this.binding.epoch,
        sequence,
        sampleStart,
        pcm,
      }, [pcm.buffer]);
    } finally {
      this.feeding = false;
    }
  }

  finish(totalSamples: number): Promise<NativePlayoutReport> {
    if (
      this.final || this.stopping || this.sealed || this.feeding ||
      totalSamples !== this.received || !this.received
    ) {
      return Promise.reject(new Error("AUDIO_PLAYER_SEAL_INVALID"));
    }
    this.sealed = true;
    this.node.port.postMessage({
      kind: "seal",
      utteranceId: this.binding.utteranceId,
      epoch: this.binding.epoch,
      totalSamples,
    });
    return this.terminal;
  }

  stop(): Promise<NativePlayoutReport> {
    if (this.final && this.drainTimer) {
      this.gain.gain.setValueAtTime(0, this.context.currentTime);
      this.teardown();
    }
    if (!this.final && !this.stopping) {
      this.stopping = true;
      this.discontinuity = true;
      this.gain.gain.setValueAtTime(0, this.context.currentTime);
      this.wake?.();
      this.wake = null;
      this.node.port.postMessage({
        kind: "stop",
        utteranceId: this.binding.utteranceId,
        epoch: this.binding.epoch,
      });
      if (this.deadline) clearTimeout(this.deadline);
      this.deadline = setTimeout(() => this.fail("AUDIO_PLAYER_STOP_UNCONFIRMED"), 1000);
    }
    return this.terminal;
  }

  private onMessage(data: any): void {
    if (this.final) return;
    if (!data || data.utteranceId !== this.binding.utteranceId || data.epoch !== this.binding.epoch) {
      return;
    }
    if (data.kind === "credit") {
      if (
        !Number.isInteger(data.samples) || data.samples < 1 || data.samples > 2400 ||
        this.capacity + data.samples > 9600 || this.frameSlots >= 4
      ) {
        this.fail("AUDIO_PLAYER_CREDIT_INVALID");
        return;
      }
      this.capacity += data.samples;
      this.frameSlots++;
      this.wake?.();
      this.wake = null;
      return;
    }
    if (this.stopping && data.kind === "report") {
      if (data.status === "playing") return;
      data = {
        ...data,
        playedSampleBoundary: this.lastBoundary,
        discontinuity: true,
        status: data.status === "failed" ? "failed" : "interrupted",
      };
    }
    if (
      data.kind !== "report" || !Number.isInteger(data.playedSampleBoundary) ||
      data.playedSampleBoundary < this.lastBoundary || data.playedSampleBoundary > this.received ||
      !["playing", "completed", "interrupted", "failed"].includes(data.status) ||
      typeof data.discontinuity !== "boolean" || (this.discontinuity && !data.discontinuity) ||
      (data.status === "completed" && (!this.sealed || data.playedSampleBoundary !== this.received))
    ) {
      this.fail("AUDIO_PLAYER_REPORT_INVALID");
      return;
    }
    this.lastBoundary = data.playedSampleBoundary;
    this.discontinuity = data.discontinuity;
    const report: NativePlayoutReport = {
      sequence: this.nextReport++,
      played_sample_boundary: data.playedSampleBoundary,
      status: data.status,
      measured_at: new Date().toISOString(),
      measurement_method: "audio_worklet_render_quantum",
      discontinuity: data.discontinuity,
    };
    if (this.pendingReceipts >= 4) {
      this.fail("AUDIO_PLAYER_RECEIPT_BACKPRESSURE");
      return;
    }
    this.pendingReceipts++;
    this.receiptChain = this.receiptChain
      .then(() => this.onReport(Object.freeze(report)))
      .catch(() => {
        this.fail("AUDIO_PLAYER_RECEIPT_CONSUMER_FAILED");
        throw new Error("AUDIO_PLAYER_RECEIPT_CONSUMER_FAILED");
      })
      .finally(() => { this.pendingReceipts--; });
    void this.receiptChain.catch(() => {});
    if (report.status !== "playing") {
      this.final = true;
      this.resolveTerminal(report);
      this.release(report.status === "completed");
    }
  }

  get receiptDelivery(): Promise<void> {
    return this.receiptChain;
  }

  private fail(code: string): void {
    if (this.final) return;
    this.final = true;
    this.rejectTerminal(new Error(code));
    this.release();
  }

  private release(drainOutput = false): void {
    if (this.deadline) clearTimeout(this.deadline);
    this.wake?.();
    this.wake = null;
    if (drainOutput && this.context.state === "running") {
      const latency = this.context.baseLatency + (this.context.outputLatency || 0);
      const delay = Number.isFinite(latency)
        ? Math.min(1000, Math.max(50, latency * 1000 + 20))
        : 100;
      this.drainTimer = setTimeout(() => this.teardown(), delay);
    } else {
      this.teardown();
    }
  }

  private teardown(): void {
    if (this.released) return;
    this.released = true;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
    this.node?.disconnect();
    this.node?.port.close();
    this.gain?.disconnect();
    const context = this.context;
    if (context && context.state !== "closed") {
      void context.close().then(() => {
        NativePcmPlayer.occupied = false;
        this.resolveClosed();
      }, () => {
        console.error("AUDIO_PLAYER_CLOSE_UNCONFIRMED");
        this.rejectClosed(new Error("AUDIO_PLAYER_CLOSE_UNCONFIRMED"));
      });
    } else {
      NativePcmPlayer.occupied = false;
      this.resolveClosed();
    }
  }
}

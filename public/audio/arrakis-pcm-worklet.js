/* Native PCM sink. Counts Web Audio render consumption, never human hearing. */
class ArrakisPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const p = options.processorOptions
    this.id = p.utteranceId
    this.epoch = p.epoch
    this.queue = []
    this.buffered = 0
    this.received = 0
    this.played = 0
    this.sequence = 0
    this.offset = 0
    this.discontinuity = false
    this.ended = false
    this.sealed = false
    this.started = false
    this.lastReport = 0
    this.port.onmessage = ({ data }) => {
      if (this.ended) return
      if (!data || data.utteranceId !== this.id || data.epoch !== this.epoch) return
      if (data.kind === 'stop') {
        this.finish('interrupted')
      } else if (data.kind === 'seal') {
        if (this.sealed || data.totalSamples !== this.received || !this.received) {
          this.finish('failed', 'AUDIO_PLAYER_SEAL_INVALID')
          return
        }
        this.sealed = true
        if (!this.buffered) this.finish('completed')
      } else if (data.kind === 'pcm') {
        const pcm = data.pcm
        if (this.sealed || !(pcm instanceof Int16Array) || !pcm.length
            || pcm.length > 2400 || this.buffered + pcm.length > 9600
            || this.queue.length >= 4 || this.sequence >= 4096
            || this.received + pcm.length > 720000
            || data.sequence !== this.sequence || data.sampleStart !== this.received) {
          this.finish('failed', 'AUDIO_PLAYER_FRAME_INVALID')
          return
        }
        this.queue.push(pcm)
        this.sequence++
        this.received += pcm.length
        this.buffered += pcm.length
      } else {
        this.finish('failed', 'AUDIO_PLAYER_PROTOCOL_INVALID')
      }
    }
  }

  report(status, errorCode) {
    this.port.postMessage({ kind: 'report', utteranceId: this.id, epoch: this.epoch,
      playedSampleBoundary: this.played, discontinuity: this.discontinuity,
      status, errorCode })
    this.lastReport = this.played
  }

  finish(status, errorCode) {
    if (this.ended) return
    this.ended = true
    this.queue = []
    this.buffered = 0
    this.report(status, errorCode)
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0]
    if (!output) return !this.ended
    output.fill(0)
    if (this.ended) return false
    if (sampleRate !== 24000) {
      this.finish('failed', 'AUDIO_PLAYER_RATE_UNSUPPORTED')
      return false
    }
    let written = 0
    while (written < output.length && this.queue.length) {
      const pcm = this.queue[0]
      const count = Math.min(output.length - written, pcm.length - this.offset)
      for (let i = 0; i < count; i++) output[written + i] = pcm[this.offset + i] / 32768
      this.offset += count
      written += count
      this.played += count
      this.buffered -= count
      this.started = true
      if (this.offset === pcm.length) {
        this.queue.shift()
        this.offset = 0
        this.port.postMessage({ kind: 'credit', utteranceId: this.id, epoch: this.epoch,
          samples: pcm.length })
      }
    }
    if (!this.buffered && this.sealed) {
      this.finish('completed')
      return false
    }
    if (written < output.length && this.started) this.discontinuity = true
    if ((this.lastReport === 0 && this.played > 0)
        || this.played - this.lastReport >= 2400) this.report('playing')
    return true
  }
}

registerProcessor('arrakis-pcm-v1', ArrakisPcmProcessor)

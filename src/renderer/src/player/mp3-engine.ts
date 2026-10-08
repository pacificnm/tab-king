import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch'
import stretchModuleUrl from 'signalsmith-stretch?url'
import type { Mp3SourceId } from './mix-plan'
import { computePeaks } from './peaks'

/**
 * Silence prepended to every source. The MP3 timeline therefore runs from -PAD_MS, which lets a negative start offset
 * (audio that begins after bar 1) work without special cases. "Media time" everywhere below includes this pad.
 */
export const PAD_MS = 8000
/** How far ahead of "now" playback is scheduled, so the stretch node can compensate for its own latency. */
const LEAD_S = 0.06
const GAIN_RAMP_S = 0.02
/** Decoded audio is large (~85 MB for 4 minutes of stereo), so cap what stays in memory. */
export const DEFAULT_MEMORY_BUDGET_BYTES = 640 * 1024 * 1024

interface Loaded {
  node: StretchNode
  gain: GainNode
  /** Length of the audio in ms, excluding the pad. */
  durationMs: number
  bytes: number
  lastUsed: number
  /** Linear gain currently requested for this source. */
  level: number
  /** Down-sampled peak envelope (0–1) of the audio after the pad, for the sync editor's waveform. */
  peaks: Float32Array
}

export interface Mp3Position {
  /** Media position in ms (pad included). */
  ms: number
}

let moduleConfigured = false

/**
 * Plays the master/stem MP3s through pitch-preserving time-stretch nodes on one AudioContext, so every source shares
 * a clock and stays sample-aligned (SYN-4, TRK-3). It only knows media time; mapping to the tab is the sync map's job.
 */
export class Mp3Engine {
  private readonly ctx: AudioContext
  private readonly out: GainNode
  private readonly sources = new Map<Mp3SourceId, Loaded>()
  private readonly pending = new Map<Mp3SourceId, Promise<void>>()
  private rate = 1
  private playing = false
  /** Position model: at AudioContext time `ctxTime` the media position is `positionSec`, advancing at `rate`. */
  private model = { ctxTime: 0, positionSec: 0, rate: 1 }
  private uses = 0

  constructor(private readonly memoryBudget = DEFAULT_MEMORY_BUDGET_BYTES) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.out = this.ctx.createGain()
    this.out.connect(this.ctx.destination)
    if (!moduleConfigured) {
      SignalsmithStretch.moduleUrl = stretchModuleUrl
      moduleConfigured = true
    }
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get currentRate(): number {
    return this.rate
  }

  get currentVolume(): number {
    return this.out.gain.value
  }

  get audioContext(): AudioContext {
    return this.ctx
  }

  /** Output node every source is mixed into (tests tap it to observe what is actually produced). */
  get output(): AudioNode {
    return this.out
  }

  /** Total media length in ms (pad included): the longest loaded source. */
  get durationMs(): number {
    let longest = 0
    for (const s of this.sources.values()) longest = Math.max(longest, s.durationMs)
    return PAD_MS + longest
  }

  has(id: Mp3SourceId): boolean {
    return this.sources.has(id)
  }

  loadedIds(): Mp3SourceId[] {
    return [...this.sources.keys()]
  }

  /** Fetch, decode and hand a source to its own stretch node. Safe to call again for the same id. */
  load(id: Mp3SourceId, url: string): Promise<void> {
    if (this.sources.has(id)) return Promise.resolve()
    let p = this.pending.get(id)
    if (!p) {
      p = this.doLoad(id, url).finally(() => this.pending.delete(id))
      this.pending.set(id, p)
    }
    return p
  }

  private async doLoad(id: Mp3SourceId, url: string): Promise<void> {
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(res.status === 404 ? 'the audio file is missing' : `HTTP ${res.status}`)
    let audio: AudioBuffer
    try {
      audio = await this.ctx.decodeAudioData(await res.arrayBuffer())
    } catch {
      throw new Error('the audio file could not be decoded')
    }
    const pad = Math.round((PAD_MS / 1000) * audio.sampleRate)
    const channels: Float32Array[] = []
    for (let c = 0; c < 2; c++) {
      // Mono sources are duplicated so the stereo stretch node sees two channels.
      const src = audio.getChannelData(Math.min(c, audio.numberOfChannels - 1))
      const data = new Float32Array(pad + src.length)
      data.set(src, pad)
      channels.push(data)
    }
    const peaks = computePeaks(audio.getChannelData(0), 2000)
    const node = await SignalsmithStretch(this.ctx)
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    node.connect(gain).connect(this.out)
    await node.addBuffers(
      channels,
      channels.map((c) => c.buffer)
    )
    const loaded: Loaded = {
      node,
      gain,
      durationMs: audio.duration * 1000,
      bytes: channels.length * (pad + audio.length) * 4,
      lastUsed: ++this.uses,
      level: 0,
      peaks
    }
    this.sources.set(id, loaded)
    // Joining while playing: line the new source up with everyone else.
    if (this.playing) {
      const at = this.ctx.currentTime + LEAD_S
      const position = this.positionSecAt(at)
      void node.schedule({ output: at, input: position, rate: this.rate, active: true })
    }
  }

  /** Peak envelope of a loaded source (audio only, no pad), for drawing a waveform. */
  peaksFor(id: Mp3SourceId): Float32Array | null {
    return this.sources.get(id)?.peaks ?? null
  }

  /** Release a source's decoded audio. */
  unload(id: Mp3SourceId): void {
    const s = this.sources.get(id)
    if (!s) return
    this.sources.delete(id)
    void s.node.dropBuffers()
    s.node.disconnect()
    s.gain.disconnect()
  }

  /** Drop least-recently-used sources (never those in `keep`) until the decoded audio fits the memory budget. */
  trimTo(keep: ReadonlySet<Mp3SourceId>): Mp3SourceId[] {
    const evicted: Mp3SourceId[] = []
    let total = [...this.sources.values()].reduce((n, s) => n + s.bytes, 0)
    const candidates = [...this.sources.entries()]
      .filter(([id]) => !keep.has(id))
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    for (const [id, s] of candidates) {
      if (total <= this.memoryBudget) break
      total -= s.bytes
      this.unload(id)
      evicted.push(id)
    }
    return evicted
  }

  get decodedBytes(): number {
    return [...this.sources.values()].reduce((n, s) => n + s.bytes, 0)
  }

  /** Which sources are heard and how loud; every other loaded source is silenced (a short ramp avoids clicks). */
  setAudible(list: readonly { id: Mp3SourceId; gain: number }[]): void {
    const levels = new Map(list.map((l) => [l.id, l.gain]))
    const now = this.ctx.currentTime
    for (const [id, s] of this.sources) {
      const level = levels.get(id) ?? 0
      s.level = level
      if (level > 0) s.lastUsed = ++this.uses
      s.gain.gain.cancelScheduledValues(now)
      s.gain.gain.setValueAtTime(s.gain.gain.value, now)
      s.gain.gain.linearRampToValueAtTime(level, now + GAIN_RAMP_S)
    }
  }

  setMasterVolume(volume: number): void {
    const now = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(now)
    this.out.gain.setValueAtTime(this.out.gain.value, now)
    this.out.gain.linearRampToValueAtTime(volume, now + GAIN_RAMP_S)
  }

  /** Playback rate (0.25–2). Pitch is preserved. */
  setRate(rate: number): void {
    if (rate === this.rate) return
    if (this.playing) {
      const at = this.ctx.currentTime + LEAD_S
      const position = this.positionSecAt(at)
      this.model = { ctxTime: at, positionSec: position, rate }
      for (const s of this.sources.values())
        void s.node.schedule({ output: at, input: position, rate })
    } else {
      this.model = { ...this.model, rate }
    }
    this.rate = rate
  }

  play(): void {
    if (this.playing) return
    void this.ctx.resume()
    const at = this.ctx.currentTime + LEAD_S
    this.model = { ctxTime: at, positionSec: this.model.positionSec, rate: this.rate }
    this.playing = true
    for (const s of this.sources.values()) {
      void s.node.schedule({
        output: at,
        input: this.model.positionSec,
        rate: this.rate,
        active: true
      })
    }
  }

  pause(): void {
    if (!this.playing) return
    const now = this.ctx.currentTime
    const position = this.positionSecAt(now)
    this.playing = false
    this.model = { ctxTime: now, positionSec: position, rate: this.rate }
    for (const s of this.sources.values()) void s.node.schedule({ output: now, active: false })
  }

  /** Jump to a media position (ms, pad included). */
  seekTo(ms: number): void {
    const sec = Math.max(0, ms) / 1000
    if (this.playing) {
      const at = this.ctx.currentTime + LEAD_S
      this.model = { ctxTime: at, positionSec: sec, rate: this.rate }
      for (const s of this.sources.values())
        void s.node.schedule({ output: at, input: sec, rate: this.rate })
    } else {
      this.model = { ctxTime: this.ctx.currentTime, positionSec: sec, rate: this.rate }
    }
  }

  /**
   * Position of the audio being heard right now, in ms (pad included): context time minus output latency.
   * `aheadS` looks that many wall-clock seconds into the future, e.g. to the moment the next frame is painted.
   */
  positionMs(aheadS = 0): number {
    const heardAt = this.ctx.currentTime - this.outputDelayS() + aheadS
    return this.clampMs(this.positionSecAt(heardAt) * 1000)
  }

  /** Where the *scheduled* audio is at AudioContext time `t` (no latency correction); used for the test probes. */
  positionMsAt(t: number): number {
    return this.clampMs(this.positionSecAt(t) * 1000)
  }

  /** Diagnostics: the AudioContext clock and its output latency, in seconds. */
  clock(): { now: number; outputLatency: number } {
    return { now: this.ctx.currentTime, outputLatency: this.outputDelayS() }
  }

  outputDelayS(): number {
    return this.ctx.outputLatency || this.ctx.baseLatency || 0
  }

  /** The stretch worklet's own report of how far through a source it has read, in ms (pad included). */
  reportedInputMs(id: Mp3SourceId): number | null {
    const s = this.sources.get(id)
    return s ? s.node.inputTime * 1000 : null
  }

  /** Ask a source's worklet to report its input position every `seconds` (for diagnostics). */
  watchInput(id: Mp3SourceId, seconds: number): void {
    void this.sources.get(id)?.node.setUpdateInterval(seconds)
  }

  /**
   * Diagnostics: watch the mixed output for beeps (the e2e fixtures have a 50 ms tone every 500 ms) and record, for
   * each onset, the media position the engine believes that sample has. Compared with where the beep really is in the
   * file, this measures the stretch node's alignment independently of alphaTab. Returns a function that stops the
   * probe and yields the onsets.
   */
  probeOnsets(threshold = 0.05): () => { mediaMs: number; freqHz: number; ctxTime: number }[] {
    const sp = this.ctx.createScriptProcessor(256, 1, 1)
    const onsets: {
      mediaMs: number
      freqHz: number
      ctxTime: number
      start: number
      crossings: number
      last: number
    }[] = []
    let quietUntil = 0
    let current: (typeof onsets)[number] | null = null
    let prev = 0
    sp.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        const v = data[i]!
        const t = e.playbackTime + i / this.ctx.sampleRate
        if (Math.abs(v) > threshold && t >= quietUntil && this.playing) {
          current = {
            mediaMs: this.positionMsAt(t),
            freqHz: 0,
            ctxTime: t,
            start: t,
            crossings: 0,
            last: t
          }
          onsets.push(current)
          quietUntil = t + 0.2
        }
        // Frequency of the beep from its zero crossings (the fixtures are pure tones), while it is sounding.
        if (current && t - current.start < 0.04) {
          if (prev <= 0 && v > 0) {
            current.crossings++
            current.last = t
          }
        }
        prev = v
      }
    }
    this.out.connect(sp)
    sp.connect(this.ctx.destination)
    return () => {
      this.out.disconnect(sp)
      sp.disconnect()
      sp.onaudioprocess = null
      return onsets.map((o) => ({
        mediaMs: o.mediaMs,
        ctxTime: o.ctxTime,
        freqHz: o.crossings > 1 ? (o.crossings - 1) / (o.last - o.start) : 0
      }))
    }
  }

  dispose(): void {
    this.playing = false
    for (const id of [...this.sources.keys()]) this.unload(id)
    void this.ctx.close()
  }

  private positionSecAt(t: number): number {
    if (!this.playing) return this.model.positionSec
    return this.model.positionSec + Math.max(0, t - this.model.ctxTime) * this.model.rate
  }

  private clampMs(ms: number): number {
    return Math.min(Math.max(ms, 0), this.durationMs)
  }
}

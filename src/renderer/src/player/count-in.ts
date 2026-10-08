import { routeToOutputDevice } from './audio-output'

/**
 * Audible count-in before playback starts (PLY-4): `clicks` clicks at the song tempo, the first accented.
 * Independent of the audio source so it also works for MP3 playback later.
 */
export class CountIn {
  private ctx: AudioContext | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private nodes: OscillatorNode[] = []

  get active(): boolean {
    return this.timer !== undefined
  }

  /** Play the clicks; `onDone` fires on the beat where the music should start. */
  start(bpm: number, clicks: number, volume: number, onDone: () => void): void {
    this.cancel()
    const intervalS = 60 / Math.max(20, bpm)
    if (!this.ctx) {
      this.ctx = new AudioContext()
      routeToOutputDevice(this.ctx)
    }
    const ctx = this.ctx
    void ctx.resume()
    const t0 = ctx.currentTime + 0.05
    for (let i = 0; i < clicks; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = i === 0 ? 1500 : 1000
      const at = t0 + i * intervalS
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(Math.min(1, volume) * 0.8, at + 0.002)
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.06)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.08)
      this.nodes.push(osc)
    }
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        this.nodes = []
        onDone()
      },
      (0.05 + clicks * intervalS) * 1000
    )
  }

  cancel(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    for (const n of this.nodes) {
      try {
        n.stop()
      } catch {
        // already stopped
      }
    }
    this.nodes = []
  }

  dispose(): void {
    this.cancel()
    void this.ctx?.close()
    this.ctx = null
  }
}

import type { AlphaTabApi } from '@coderline/alphatab'
import type { Mp3SourceId } from './mix-plan'
import { Mp3Engine, PAD_MS } from './mp3-engine'

/**
 * The cursor is painted on the frame after we report a position, so report where the audio will be then (about
 * half a 60 Hz frame on average). Without it the cursor trails the audio by a constant, speed-dependent amount.
 */
const DISPLAY_LEAD_S = 0.008
import type { SyncMap } from './sync-map'

/** alphaTab's external-media contract: it asks, we play. All times are media ms (including {@link PAD_MS}). */
interface ExternalMediaHandler {
  readonly backingTrackDuration: number
  playbackRate: number
  masterVolume: number
  seekTo(ms: number): void
  play(): void
  pause(): void
}

/** The player's output when `playerMode` is external media. alphaTab does not export this type. */
interface ExternalMediaOutput {
  handler: ExternalMediaHandler | undefined
  /** Report where the media is; alphaTab converts it to a tab position through the sync points. */
  updatePosition(mediaMs: number): void
}

/**
 * Connects the MP3 engine to alphaTab's external-media mode: alphaTab keeps owning looping, ranges, speed and the
 * cursor; the MP3 engine's clock is the time axis, mapped to the tab by sync points (SYN-1, SYN-2, SYN-4).
 */
export class Mp3Playback {
  private engine: Mp3Engine | null = null
  private raf = 0
  private attached = false

  constructor(
    private readonly api: AlphaTabApi,
    /** Called when the engine is created so the owner can configure rate/volume before playback. */
    private readonly onEngine?: (engine: Mp3Engine) => void
  ) {}

  get mp3(): Mp3Engine | null {
    return this.engine
  }

  /** Load every listed source; resolves with the ones that failed (and why) instead of throwing. */
  async load(
    sources: readonly { id: Mp3SourceId; url: string }[]
  ): Promise<Map<Mp3SourceId, string>> {
    const failures = new Map<Mp3SourceId, string>()
    if (!this.engine) {
      this.engine = new Mp3Engine()
      this.onEngine?.(this.engine)
    }
    const engine = this.engine
    await Promise.all(
      sources.map(async (s) => {
        try {
          await engine.load(s.id, s.url)
        } catch (e) {
          failures.set(s.id, e instanceof Error ? e.message : String(e))
        }
      })
    )
    return failures
  }

  /** Hand alphaTab the handler; call each time the (re)created external-media player is ready. */
  attach(): void {
    const engine = this.engine
    const out = this.output()
    if (!engine || !out) return
    out.handler = {
      get backingTrackDuration() {
        return engine.durationMs
      },
      get playbackRate() {
        return engine.currentRate
      },
      set playbackRate(v: number) {
        engine.setRate(v)
      },
      get masterVolume() {
        return engine.currentVolume
      },
      set masterVolume(v: number) {
        engine.setMasterVolume(v)
      },
      seekTo: (ms) => engine.seekTo(ms),
      play: () => {
        engine.play()
        this.startTicker()
      },
      pause: () => {
        engine.pause()
        this.stopTicker()
        out.updatePosition(engine.positionMs())
      }
    }
    this.attached = true
  }

  /** Stop driving alphaTab (switching back to the synth, or tearing down). */
  detach(): void {
    this.stopTicker()
    this.engine?.pause()
    this.attached = false
  }

  /**
   * Give alphaTab the anchors that map media time to bars. A trailing anchor at the end of the tab keeps the last
   * segment's ratio (alphaTab would otherwise stretch the remaining tab over the remaining audio).
   */
  applySyncMap(map: SyncMap): void {
    const score = this.api.score
    if (!score) return
    score.applyFlatSyncPoints(
      map.anchors.map((a) => ({
        barIndex: a.barIndex,
        barPosition: a.barPosition,
        barOccurence: 0,
        millisecondOffset: a.mp3Ms + PAD_MS
      }))
    )
    this.api.updateSyncPoints()
  }

  clearSyncPoints(): void {
    this.api.score?.applyFlatSyncPoints([])
  }

  /** Drop every loaded source (a different song is opening). */
  unloadAll(): void {
    this.stopTicker()
    if (!this.engine) return
    this.engine.pause()
    for (const id of this.engine.loadedIds()) this.engine.unload(id)
  }

  dispose(): void {
    this.stopTicker()
    this.engine?.dispose()
    this.engine = null
    this.attached = false
  }

  private output(): ExternalMediaOutput | null {
    // alphaTab's public IAlphaSynth hides `output`; in external-media mode it is the output below.
    const player = this.api.player as unknown as { output?: ExternalMediaOutput } | null
    return player?.output && 'updatePosition' in player.output ? player.output : null
  }

  private startTicker(): void {
    if (this.raf) return
    const tick = (): void => {
      const engine = this.engine
      const out = this.output()
      if (!engine || !out || !this.attached || !engine.isPlaying) {
        this.raf = 0
        return
      }
      out.updatePosition(engine.positionMs(DISPLAY_LEAD_S))
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopTicker(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}

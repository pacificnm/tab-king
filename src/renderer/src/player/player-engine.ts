import { AlphaTabApi, LayoutMode, type model } from '@coderline/alphatab'
import type { SongTrack, SynthSource } from '@shared/types'
import { CountIn } from './count-in'
import {
  barAtTick,
  clampSpeed,
  nextBarTick,
  normalizeRange,
  prevBarTick,
  sectionsFromMarkers,
  tempoAtBar,
  type BarSpan
} from './player-math'
import { instrumentName } from './gp-metadata'
import { clampTrackVolume, effectiveMix } from './mix-math'
import { scheduleSaveMix } from './mix-persistence'
import { spliceExternalMidi } from './midi-splice'
import type { ParsedSmf } from './smf'
import { usePlayerStore, type PanelTrack, type TabLayout } from './store'

export const COUNT_IN_CLICKS = 3

export interface LoadOptions {
  /** Saved mix for the song's tracks, by track index. */
  mix: readonly SongTrack[]
  synthSource: SynthSource
  /** The attached MIDI file, already parsed, if any. */
  midi: ParsedSmf | null
}

const set = usePlayerStore.setState
const get = usePlayerStore.getState

/**
 * The only code that talks to alphaTab. React components call the controller in `index.ts`,
 * which delegates here; alphaTab events are translated into store updates.
 */
export class PlayerEngine {
  private readonly api: AlphaTabApi
  private readonly countIn = new CountIn()
  private spans: BarSpan[] = []
  private ready = false
  private destroyed = false
  private freshLoad = false
  private savedMix: readonly SongTrack[] = []
  private midiFile: ParsedSmf | null = null
  private afterRender: (() => void) | null = null

  constructor(
    container: HTMLElement,
    scrollElement: HTMLElement,
    fontDirectory: string,
    soundFontUrl: string
  ) {
    const s = get()
    this.api = new AlphaTabApi(container, {
      core: { fontDirectory },
      display: { scale: s.zoom, layoutMode: s.layout },
      player: {
        enablePlayer: true,
        // alphaTab sequences this against its own player/MIDI setup; loading bytes by hand raced with it.
        soundFont: soundFontUrl,
        enableCursor: true,
        enableUserInteraction: true,
        enableElementHighlighting: true,
        scrollElement,
        scrollMode: 'continuous'
      }
    })
    this.api.playbackSpeed = s.speed
    this.api.masterVolume = s.masterVolume
    this.applyMetronome()
    this.wire()
  }

  /** Render a Guitar Pro file (all tracks). Playback is ready when `status` becomes 'ready'. */
  load(bytes: ArrayBuffer, opts: LoadOptions): void {
    if (get().playing || get().countingIn) this.stop()
    this.ready = false
    this.spans = []
    this.freshLoad = true
    this.afterRender = null
    this.savedMix = opts.mix
    this.midiFile = opts.midi
    set({
      status: 'loading',
      error: null,
      positionMs: 0,
      durationMs: 0,
      currentMeasure: 0,
      measureCount: 0,
      sections: [],
      range: null,
      tracks: [],
      practiceTrack: null,
      hasMidi: opts.midi !== null,
      synthSource: opts.midi ? opts.synthSource : 'gp'
    })
    try {
      this.api.load(new Uint8Array(bytes), [-1])
    } catch (e) {
      this.fail(e)
    }
  }

  play(): void {
    if (!this.ready) return
    const s = get()
    if (s.playing || s.countingIn) return
    if (s.countInOn) {
      const bar = barAtTick(this.spans, this.api.tickPosition)
      const score = this.api.score
      const bpm = score ? tempoAtBar(score.tempo, score.masterBars, bar) * s.speed : 120
      set({ countingIn: true })
      this.countIn.start(bpm, COUNT_IN_CLICKS, s.metronomeVolume, () => {
        set({ countingIn: false })
        this.api.play()
      })
    } else {
      this.api.play()
    }
  }

  pause(): void {
    if (this.countIn.active) {
      this.countIn.cancel()
      set({ countingIn: false })
      return
    }
    this.api.pause()
  }

  togglePlay(): void {
    const s = get()
    if (s.playing || s.countingIn) this.pause()
    else this.play()
  }

  stop(): void {
    this.countIn.cancel()
    set({ countingIn: false })
    this.api.stop()
  }

  /** Back to the start (or the start of the selected range). */
  restart(): void {
    const wasPlaying = get().playing
    this.countIn.cancel()
    set({ countingIn: false })
    this.api.tickPosition = this.api.playbackRange?.startTick ?? 0
    if (wasPlaying) this.api.play()
  }

  seekMs(ms: number): void {
    if (this.ready) this.api.timePosition = Math.max(0, ms)
  }

  previous(): void {
    if (this.ready) this.api.tickPosition = prevBarTick(this.spans, this.api.tickPosition)
  }

  next(): void {
    const t = nextBarTick(this.spans, this.api.tickPosition)
    if (this.ready && t !== null) this.api.tickPosition = t
  }

  setSpeed(speed: number): void {
    const v = clampSpeed(speed)
    this.api.playbackSpeed = v
    set({ speed: v })
  }

  setMetronome(on: boolean, volume = get().metronomeVolume): void {
    set({ metronomeOn: on, metronomeVolume: volume })
    this.applyMetronome()
  }

  setCountIn(on: boolean): void {
    set({ countInOn: on })
  }

  setLoop(on: boolean): void {
    this.api.isLooping = on
    set({ loopOn: on })
  }

  setMasterVolume(v: number): void {
    const vol = Math.min(1, Math.max(0, v))
    this.api.masterVolume = vol
    set({ masterVolume: vol })
  }

  /** Select (and highlight) 1-based measures [start, end]; the loop toggle decides whether it repeats. */
  setRange(start: number, end: number): void {
    const r = normalizeRange(start, end, this.spans.length)
    const first = r && this.spans[r.start - 1]
    const last = r && this.spans[r.end - 1]
    if (!r || !first || !last) return
    this.api.playbackRange = { startTick: first.start, endTick: last.end }
  }

  clearRange(): void {
    this.api.playbackRange = null
    this.api.clearPlaybackRangeHighlight()
    set({ range: null })
  }

  setZoom(zoom: number): void {
    const v = Math.min(2, Math.max(0.5, Math.round(zoom * 20) / 20))
    this.api.settings.display.scale = v
    this.api.updateSettings()
    this.api.render()
    set({ zoom: v })
  }

  setLayout(layout: TabLayout): void {
    this.api.settings.display.layoutMode =
      layout === 'page' ? LayoutMode.Page : LayoutMode.Horizontal
    this.api.updateSettings()
    this.api.render()
    set({ layout })
  }

  setTrackVolume(index: number, volume: number): void {
    this.updateTrack(index, { volume: clampTrackVolume(volume) })
  }

  toggleMute(index: number): void {
    const t = get().tracks.find((x) => x.index === index)
    if (t) this.updateTrack(index, { muted: !t.muted })
  }

  toggleSolo(index: number): void {
    const t = get().tracks.find((x) => x.index === index)
    if (t) this.updateTrack(index, { solo: !t.solo })
  }

  /**
   * Single-track practice view (TRK-5): render and play only this track; `null` restores the full score
   * and the user's mix, which is never modified by the practice view.
   */
  setPractice(index: number | null): void {
    const score = this.api.score
    if (!score || !this.ready || index === get().practiceTrack) return
    const track = index === null ? null : score.tracks[index]
    if (index !== null && !track) return
    const resume = get().playing
    const tick = this.api.tickPosition
    if (resume) this.api.pause()
    set({ practiceTrack: index })
    this.applyMix()
    // Re-rendering resets the playback position; put the player back where it was afterwards.
    this.afterRender = () => {
      this.api.tickPosition = tick
      if (resume) this.api.play()
    }
    this.api.renderTracks(track ? [track] : score.tracks)
  }

  /** Choose where the synth takes its notes from (TRK-6). No-op without a usable attached MIDI file. */
  setSynthSource(source: SynthSource): void {
    if (!this.midiFile && source === 'midi') return
    if (source === get().synthSource) return
    const resume = get().playing
    const tick = this.api.tickPosition
    if (resume) this.api.pause()
    set({ synthSource: source })
    scheduleSaveMix()
    // Regenerate the MIDI; the midiLoad hook swaps the note events in when source is 'midi'.
    this.api.loadMidiForScore()
    this.afterRender = () => {
      this.api.tickPosition = tick
      if (resume) this.api.play()
    }
    if (this.ready) queueMicrotask(() => this.runAfterRender())
  }

  destroy(): void {
    this.destroyed = true
    this.countIn.dispose()
    this.api.destroy()
    set({ playing: false, countingIn: false, status: 'idle' })
  }

  private runAfterRender(): void {
    const cb = this.afterRender
    this.afterRender = null
    cb?.()
  }

  private updateTrack(index: number, patch: Partial<PanelTrack>): void {
    set((s) => ({ tracks: s.tracks.map((t) => (t.index === index ? { ...t, ...patch } : t)) }))
    this.applyMix()
    scheduleSaveMix()
  }

  /** Push the effective mix (user mix, or the practice track alone) to the synth. */
  private applyMix(): void {
    const score = this.api.score
    if (!score) return
    const { tracks, practiceTrack } = get()
    for (const m of effectiveMix(
      tracks.map((t) => ({ index: t.index, volume: t.volume, muted: t.muted, solo: t.solo })),
      practiceTrack
    )) {
      const track = score.tracks[m.index]
      if (!track) continue
      this.api.changeTrackVolume([track], m.volume)
      this.api.changeTrackMute([track], m.mute)
      this.api.changeTrackSolo([track], m.solo)
    }
  }

  private applyMetronome(): void {
    const { metronomeOn, metronomeVolume } = get()
    this.api.metronomeVolume = metronomeOn ? metronomeVolume : 0
  }

  private fail(e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e)
    set({
      status: 'error',
      error: `Could not open this song: ${msg}`,
      playing: false,
      countingIn: false
    })
  }

  private measureOf(tick: number): number {
    return barAtTick(this.spans, tick) + 1
  }

  private wire(): void {
    const api = this.api

    api.scoreLoaded.on((score: model.Score) => {
      set({
        measureCount: score.masterBars.length,
        sections: sectionsFromMarkers(score.masterBars.map((b) => b.section?.text.trim() || null))
      })
      // scoreLoaded also fires when re-rendering other tracks; only a fresh load builds the track list.
      if (!this.freshLoad) return
      this.freshLoad = false
      const saved = new Map(this.savedMix.map((t) => [t.trackIndex, t]))
      set({
        tracks: score.tracks.map((t, i) => ({
          index: i,
          name: t.name.trim() || `Track ${i + 1}`,
          instrument: instrumentName(
            t.playbackInfo.program,
            t.staves.some((st) => st.isPercussion)
          ),
          volume: saved.get(i)?.volume ?? 1,
          muted: saved.get(i)?.muted ?? false,
          solo: saved.get(i)?.solo ?? false
        }))
      })
    })

    api.midiLoad.on((file) => {
      if (this.midiFile && get().synthSource === 'midi') spliceExternalMidi(file, this.midiFile)
    })

    api.playerReady.on(() => {
      if (this.destroyed || !api.score || !api.tickCache) return
      const lookup = api.tickCache
      this.spans = api.score.masterBars.map((b) => {
        const l = lookup.getMasterBar(b)
        return { index: b.index, start: l.start, end: l.end }
      })
      this.ready = true
      // A new score drops the old selection; restore the user's loop/speed/metronome settings.
      api.isLooping = get().loopOn
      api.playbackSpeed = get().speed
      const first = get().status !== 'ready'
      set({
        status: 'ready',
        measureCount: this.spans.length,
        ...(first ? { currentMeasure: 1 } : {})
      })
      this.applyMix()
      if (get().autoplay) {
        set({ autoplay: false })
        this.play()
      }
      this.runAfterRender()
    })

    api.playerStateChanged.on((e) => {
      set({ playing: e.state === 1 })
    })

    api.playerPositionChanged.on((e) => {
      set({
        positionMs: e.currentTime,
        durationMs: e.endTime,
        // While playing, playedBeatChanged is more accurate (repeats); this covers seeks and idle.
        ...(get().playing && !e.isSeek ? {} : { currentMeasure: this.measureOf(e.currentTick) })
      })
    })

    api.playedBeatChanged.on((beat: model.Beat) => {
      set({ currentMeasure: beat.voice.bar.masterBar.index + 1 })
    })

    api.playbackRangeChanged.on((e) => {
      const r = e.playbackRange
      set({
        range: r
          ? {
              start: this.measureOf(r.startTick),
              end: this.measureOf(Math.max(r.startTick, r.endTick - 1))
            }
          : null
      })
    })

    api.playerFinished.on(() => set({ playing: false }))

    api.error.on((e) => this.fail(e))
  }
}

import { AlphaTabApi, LayoutMode, midi, PlayerMode, type model } from '@coderline/alphatab'
import type { AudioSource, SongTrack, SyncPointRow, SynthSource } from '@shared/types'
import { CountIn } from './count-in'
import { instrumentName } from './gp-metadata'
import { clampTrackVolume } from './mix-math'
import {
  planPlayback,
  stemsToLoad,
  type Mp3SourceId,
  type PlanInput,
  type PlaybackPlan
} from './mix-plan'
import { scheduleSaveMix } from './mix-persistence'
import { spliceExternalMidi } from './midi-splice'
import type { Mp3Engine } from './mp3-engine'
import { Mp3Playback } from './mp3-playback'
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
import type { ParsedSmf } from './smf'
import { usePlayerStore, type PanelTrack, type PlaybackMode, type TabLayout } from './store'
import { buildSyncMap, mp3MsToTabMs, tabMsToMp3Ms, type SyncMap } from './sync-map'
import { PAD_MS } from './mp3-engine'
import { buildTickToMs, type TempoEvent } from './tempo-map'

export const COUNT_IN_CLICKS = 3
/** Position updates reach the store at most this often (alphaTab reports every animation frame in MP3 mode). */
const POSITION_THROTTLE_MS = 80
const READY_TIMEOUT_MS = 15_000

export interface LoadOptions {
  /** Saved mix for the song's tracks, by track index. */
  mix: readonly SongTrack[]
  synthSource: SynthSource
  /** The attached MIDI file, already parsed, if any. */
  midi: ParsedSmf | null
  masterSource: AudioSource
  masterUrl: string | null
  /** Stem MP3 URLs by track index. */
  stemUrls: ReadonlyMap<number, string>
  syncOffsetMs: number
  syncPoints: readonly SyncPointRow[]
}

/** What the sync editor needs to draw bars against the audio. */
export interface SyncContext {
  /** Tab time (ms at 100%) at the start of each bar. */
  barStartsMs: number[]
  tabEndMs: number
}

const set = usePlayerStore.setState
const get = usePlayerStore.getState

const stemId = (index: number): Mp3SourceId => `track:${index}`

/**
 * The only code that talks to alphaTab. React components call the controller in `index.ts`,
 * which delegates here; alphaTab events are translated into store updates.
 *
 * Two playback modes share one alphaTab instance: `synth` (alphaTab's synthesizer is the clock) and `mp3`
 * (alphaTab's external-media mode, with the MP3 engine as the clock). `planPlayback` decides which one is needed.
 */
export class PlayerEngine {
  private readonly api: AlphaTabApi
  private readonly countIn = new CountIn()
  private readonly mp3: Mp3Playback
  private spans: BarSpan[] = []
  private tempos: TempoEvent[] = []
  private ready = false
  private destroyed = false
  private freshLoad = false
  /** A score has been loaded and the first playerReady has not yet been handled. */
  private loading = false
  private mode: PlaybackMode = 'synth'
  private savedMix: readonly SongTrack[] = []
  private midiFile: ParsedSmf | null = null
  private masterUrl: string | null = null
  private stemUrls: ReadonlyMap<number, string> = new Map()
  private failed = new Set<Mp3SourceId>()
  private readyWaiters: (() => void)[] = []
  /** Serialises everything that reconfigures playback (mode switches, practice, sources). */
  private op: Promise<void> = Promise.resolve()
  private lastPositionAt = 0

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
    this.mp3 = new Mp3Playback(this.api, (engine) => {
      engine.setRate(get().speed)
      engine.setMasterVolume(get().masterVolume)
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
    this.loading = true
    this.spans = []
    this.tempos = []
    this.freshLoad = true
    this.readyWaiters = []
    this.savedMix = opts.mix
    this.midiFile = opts.midi
    this.masterUrl = opts.masterUrl
    this.stemUrls = opts.stemUrls
    this.failed = new Set()
    this.mp3.unloadAll()
    set({
      status: 'loading',
      error: null,
      audioError: null,
      audioStatus: 'idle',
      positionMs: 0,
      durationMs: 0,
      currentMeasure: 0,
      measureCount: 0,
      sections: [],
      range: null,
      tracks: [],
      practiceTrack: null,
      hasMidi: opts.midi !== null,
      synthSource: opts.midi ? opts.synthSource : 'gp',
      masterSource: opts.masterUrl ? opts.masterSource : 'synth',
      hasMaster: opts.masterUrl !== null,
      silencedSynthTracks: [],
      syncOffsetMs: opts.syncOffsetMs,
      syncPoints: [...opts.syncPoints]
    })
    try {
      this.api.load(new Uint8Array(bytes), [-1])
    } catch (e) {
      this.fail(e)
    }
  }

  play(): void {
    if (!this.ready || get().audioStatus === 'loading') return
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

  /** Choose whether a track is heard from the synth or its stem MP3 (TRK-4). */
  setTrackSource(index: number, source: AudioSource): void {
    const t = get().tracks.find((x) => x.index === index)
    if (!t || (source === 'mp3' && !t.hasMp3) || t.source === source) return
    this.updateTrack(index, { source })
  }

  /** Choose whether the band is heard from the synth or the master MP3 (TRK-4). */
  setMasterSource(source: AudioSource): void {
    if ((source === 'mp3' && !get().hasMaster) || source === get().masterSource) return
    set({ masterSource: source })
    scheduleSaveMix()
    this.queue(() => this.applyPlan())
  }

  /**
   * Single-track practice view (TRK-5): render and play only this track (its stem if it uses one, otherwise the
   * synth); `null` restores the full score and the user's mix, which the practice view never modifies.
   */
  setPractice(index: number | null): void {
    if (!this.ready || index === get().practiceTrack) return
    this.queue(async () => {
      const score = this.api.score
      const track = index === null ? null : score?.tracks[index]
      if (!score || (index !== null && !track)) return
      const resume = get().playing
      const tick = this.api.tickPosition
      if (resume) this.api.pause()
      set({ practiceTrack: index })
      // Re-rendering resets the playback position; put the player back where it was afterwards.
      await this.waitForReady(() => this.api.renderTracks(track ? [track] : score.tracks))
      this.api.tickPosition = tick
      await this.applyPlan()
      this.api.tickPosition = tick
      if (resume) this.api.play()
    })
  }

  /** Choose where the synth takes its notes from (TRK-6). No-op without a usable attached MIDI file. */
  setSynthSource(source: SynthSource): void {
    if (!this.midiFile && source === 'midi') return
    if (source === get().synthSource) return
    this.queue(async () => {
      const resume = get().playing
      const tick = this.api.tickPosition
      if (resume) this.api.pause()
      set({ synthSource: source })
      scheduleSaveMix()
      // Regenerate the MIDI; the midiLoad hook swaps the note events in when source is 'midi'.
      await this.waitForReady(() => this.api.loadMidiForScore())
      this.api.tickPosition = tick
      if (resume) this.api.play()
    })
  }

  /**
   * Use a new start offset / sync points right away (sync editor preview, and after saving). Nothing is persisted
   * here; the editor saves through the library API.
   */
  setSync(offsetMs: number, points: readonly SyncPointRow[]): void {
    set({ syncOffsetMs: offsetMs, syncPoints: [...points] })
    if (this.mode === 'mp3') this.refreshSyncMap()
  }

  /** Bar start times for drawing the sync editor; null until a score is ready. */
  syncContext(): SyncContext | null {
    if (this.spans.length === 0) return null
    const toMs = buildTickToMs(this.tempos)
    return {
      barStartsMs: this.spans.map((s) => toMs(s.start)),
      tabEndMs: toMs(this.spans[this.spans.length - 1]!.end)
    }
  }

  /** The MP3 engine, once created (waveform data, media position). */
  get mp3Engine(): Mp3Engine | null {
    return this.mp3.mp3
  }

  /** Load a source for the sync editor even when the plan isn't using it (e.g. master while on the synth). */
  async ensureSource(id: Mp3SourceId): Promise<boolean> {
    const url = id === 'master' ? this.masterUrl : this.stemUrls.get(Number(id.split(':')[1]))
    if (!url) return false
    const failures = await this.mp3.load([{ id, url }])
    return failures.size === 0
  }

  /** Timing snapshot for the e2e drift tests: where the cursor says the audio should be vs. where it is. */
  diagnostics(): {
    mode: PlaybackMode
    playing: boolean
    tick: number
    tabMs: number
    expectedMediaMs: number | null
    actualMediaMs: number | null
  } {
    const toMs = buildTickToMs(this.tempos)
    const tick = this.api.tickPosition
    const tabMs = toMs(tick)
    const ctx = this.syncContext()
    let expected: number | null = null
    if (ctx) {
      const { syncOffsetMs, syncPoints } = get()
      const map = buildSyncMap({
        offsetMs: syncOffsetMs,
        points: syncPoints,
        barStartsMs: ctx.barStartsMs,
        tabEndMs: ctx.tabEndMs
      })
      expected = tabMsToMp3Ms(map, tabMs) + PAD_MS
    }
    return {
      mode: this.mode,
      playing: get().playing,
      tick,
      tabMs,
      expectedMediaMs: expected,
      actualMediaMs: this.mp3.mp3?.positionMs() ?? null
    }
  }

  /** Test probe: the cursor's tab time (ms at 100%) together with the audio clock, for drift measurements. */
  cursorSample(): { ctxTime: number; outputLatency: number; tabMs: number } | null {
    const clock = this.mp3.mp3?.clock()
    if (!clock) return null
    return {
      ctxTime: clock.now,
      outputLatency: clock.outputLatency,
      tabMs: buildTickToMs(this.tempos)(this.api.tickPosition)
    }
  }

  /** Test helper: where the sync map says a point `fileMs` into the MP3 sits on the tab (tab ms at 100%). */
  tabMsForFileMs(fileMs: number): number | null {
    const ctx = this.syncContext()
    if (!ctx) return null
    const { syncOffsetMs, syncPoints } = get()
    return mp3MsToTabMs(
      buildSyncMap({
        offsetMs: syncOffsetMs,
        points: syncPoints,
        barStartsMs: ctx.barStartsMs,
        tabEndMs: ctx.tabEndMs
      }),
      fileMs
    )
  }

  destroy(): void {
    this.destroyed = true
    this.countIn.dispose()
    this.mp3.dispose()
    this.api.destroy()
    set({ playing: false, countingIn: false, status: 'idle', playbackMode: 'synth' })
  }

  // ---- playback plan -------------------------------------------------------------------------------------

  private queue(fn: () => Promise<void>): void {
    this.op = this.op.then(fn).catch((e) => {
      set({ audioStatus: 'idle', audioError: e instanceof Error ? e.message : String(e) })
    })
  }

  private planInput(): PlanInput {
    const s = get()
    return {
      tracks: s.tracks.map((t) => ({
        index: t.index,
        volume: t.volume,
        muted: t.muted,
        solo: t.solo,
        source: t.source,
        hasMp3: t.hasMp3 && !this.failed.has(stemId(t.index))
      })),
      masterSource: s.masterSource,
      hasMaster: s.hasMaster && !this.failed.has('master'),
      practice: s.practiceTrack
    }
  }

  private urlFor(id: Mp3SourceId): string | null {
    return id === 'master' ? this.masterUrl : (this.stemUrls.get(Number(id.split(':')[1])) ?? null)
  }

  /** Make playback match the current mix: load audio, switch engine if needed, push gains/mix. */
  private async applyPlan(): Promise<void> {
    if (!this.ready || this.destroyed) return
    let plan = planPlayback(this.planInput())

    if (plan.mode === 'mp3') {
      const needed = plan.mp3.map((m) => m.id).filter((id) => !this.mp3.mp3?.has(id))
      if (needed.length > 0) {
        set({ audioStatus: 'loading' })
        const failures = await this.mp3.load(
          needed.flatMap((id) => {
            const url = this.urlFor(id)
            return url ? [{ id, url }] : []
          })
        )
        if (failures.size > 0) {
          for (const id of failures.keys()) this.failed.add(id)
          set({
            audioError: `Couldn't load ${[...failures].map(([id, why]) => `${this.labelFor(id)} (${why})`).join(', ')}. Playing the synth instead.`
          })
          plan = planPlayback(this.planInput()) // failed sources no longer count
        }
        set({ audioStatus: 'idle' })
      }
    }

    set({ silencedSynthTracks: plan.silencedSynthTracks })
    if (plan.mode === 'mp3') {
      if (this.mode !== 'mp3') await this.switchMode('mp3')
      this.mp3.mp3?.setAudible(plan.mp3)
      this.refreshSyncMap()
      this.trimMemory(plan)
    } else {
      if (this.mode !== 'synth') await this.switchMode('synth')
      this.pushSynthMix(plan)
    }
    set({ playbackMode: this.mode })
  }

  private labelFor(id: Mp3SourceId): string {
    if (id === 'master') return 'the master MP3'
    const t = get().tracks.find((x) => x.index === Number(id.split(':')[1]))
    return t ? `the ${t.name} MP3` : 'a track MP3'
  }

  /** Switch alphaTab between its synthesizer and external-media mode, keeping position, range and playing state. */
  private async switchMode(target: PlaybackMode): Promise<void> {
    const resume = get().playing
    const tick = this.api.tickPosition
    this.countIn.cancel()
    set({ countingIn: false })
    if (resume) this.api.pause()
    this.mp3.detach()
    this.api.settings.player.playerMode =
      target === 'mp3' ? PlayerMode.EnabledExternalMedia : PlayerMode.EnabledSynthesizer
    await this.waitForReady(() => this.api.updateSettings())
    this.mode = target
    // updateSettings re-creates the player: put back everything it forgot.
    this.api.playbackSpeed = get().speed
    this.api.masterVolume = get().masterVolume
    this.api.isLooping = get().loopOn
    this.applyMetronome()
    if (target === 'mp3') {
      this.mp3.attach()
      this.refreshSyncMap()
    } else {
      this.mp3.clearSyncPoints()
    }
    this.api.tickPosition = tick
    if (resume) this.api.play()
  }

  /** Recompute and apply the media↔tab anchors (offset, sync points, trailing anchor). */
  private refreshSyncMap(): void {
    const ctx = this.syncContext()
    if (!ctx || this.mode !== 'mp3') return
    const { syncOffsetMs, syncPoints } = get()
    const map: SyncMap = buildSyncMap({
      offsetMs: syncOffsetMs,
      points: syncPoints,
      barStartsMs: ctx.barStartsMs,
      tabEndMs: ctx.tabEndMs
    })
    this.mp3.applySyncMap(map)
  }

  /** Keep decoded audio within budget, preferring to keep what the plan and the user's stems need. */
  private trimMemory(plan: PlaybackPlan): void {
    const engine = this.mp3.mp3
    if (!engine) return
    const keep = new Set<Mp3SourceId>(plan.mp3.map((m) => m.id))
    engine.trimTo(keep)
    // Warm the remaining stems so switching between them is instant, as far as memory allows.
    const s = get()
    void (async () => {
      for (const id of stemsToLoad(
        s.tracks.map((t) => ({
          index: t.index,
          volume: t.volume,
          muted: t.muted,
          solo: t.solo,
          source: t.source,
          hasMp3: t.hasMp3
        })),
        s.masterSource,
        s.hasMaster
      )) {
        const url = this.urlFor(id)
        if (!url || engine.has(id) || this.failed.has(id) || this.destroyed) continue
        if (engine.decodedBytes > 400 * 1024 * 1024) break
        await this.mp3.load([{ id, url }])
        engine.trimTo(keep)
      }
    })()
  }

  private pushSynthMix(plan: PlaybackPlan): void {
    const score = this.api.score
    if (!score) return
    for (const m of plan.synthMix) {
      const track = score.tracks[m.index]
      if (!track) continue
      this.api.changeTrackVolume([track], m.volume)
      this.api.changeTrackMute([track], m.mute)
      this.api.changeTrackSolo([track], m.solo)
    }
  }

  /** Resolves on the next `playerReady` (after the trigger), or after a timeout so nothing can hang. */
  private waitForReady(trigger: () => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, READY_TIMEOUT_MS)
      function done(): void {
        clearTimeout(timer)
        resolve()
      }
      this.readyWaiters.push(done)
      trigger()
    })
  }

  private updateTrack(index: number, patch: Partial<PanelTrack>): void {
    set((s) => ({ tracks: s.tracks.map((t) => (t.index === index ? { ...t, ...patch } : t)) }))
    scheduleSaveMix()
    this.queue(() => this.applyPlan())
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
        tracks: score.tracks.map((t, i) => {
          const hasMp3 = this.stemUrls.has(i)
          return {
            index: i,
            name: t.name.trim() || `Track ${i + 1}`,
            instrument: instrumentName(
              t.playbackInfo.program,
              t.staves.some((st) => st.isPercussion)
            ),
            source: hasMp3 ? (saved.get(i)?.source ?? 'synth') : 'synth',
            hasMp3,
            volume: saved.get(i)?.volume ?? 1,
            muted: saved.get(i)?.muted ?? false,
            solo: saved.get(i)?.solo ?? false
          }
        })
      })
    })

    api.midiLoad.on((file) => {
      this.tempos = file.tracks
        .flatMap((t) => t.events)
        .filter(
          (e): e is InstanceType<typeof midi.TempoChangeEvent> =>
            e.type === midi.MidiEventType.TempoChange
        )
        .map((e) => ({ tick: e.tick, bpm: e.beatsPerMinute }))
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
      const waiters = this.readyWaiters.splice(0)

      if (this.loading) {
        this.loading = false
        // A new score drops the old selection; restore the user's loop/speed/metronome settings.
        api.isLooping = get().loopOn
        api.playbackSpeed = get().speed
        set({ measureCount: this.spans.length, currentMeasure: 1 })
        this.queue(async () => {
          await this.applyPlan()
          set({ status: 'ready' })
          if (get().autoplay) {
            set({ autoplay: false })
            this.play()
          }
        })
      } else {
        set({ measureCount: this.spans.length })
      }
      for (const w of waiters) w()
    })

    api.playerStateChanged.on((e) => {
      set({ playing: e.state === 1 })
    })

    api.playerPositionChanged.on((e) => {
      const now = performance.now()
      if (!e.isSeek && get().playing && now - this.lastPositionAt < POSITION_THROTTLE_MS) return
      this.lastPositionAt = now
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

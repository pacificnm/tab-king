import type { AudioSource, Song, SyncPointRow, SynthSource } from '@shared/types'
import { flushMix } from './mix-persistence'
import { makeQueue, seekQueue, type Queue } from './queue'
import type { PlayerEngine } from './player-engine'
import { clampSpeed, stepSpeed } from './player-math'
import { usePlayerStore, type TabLayout } from './store'

export { usePlayerStore } from './store'
export type { PlayerState, TabLayout } from './store'
export type { Queue }
export { formatTime } from './player-math'

let engine: PlayerEngine | null = null
const set = usePlayerStore.setState
const get = usePlayerStore.getState

/**
 * What the UI calls to control playback. Components never import alphaTab; the engine is attached
 * by the (lazy-loaded) tab view and every command is a no-op until it is.
 */
export const player = {
  attach(e: PlayerEngine): void {
    engine = e
  },
  detach(e: PlayerEngine): void {
    if (engine === e) engine = null
  },

  /** Open a song in the player; with `autoplay` it starts as soon as it is ready. */
  open(song: Song, autoplay = true): void {
    flushMix() // save the previous song's track mix before it is replaced
    set((s) => ({ song, openToken: s.openToken + 1, autoplay, status: 'loading', error: null }))
  },
  /** Set what plays after this song; pass the songs of an album/playlist/search and where in them we are. */
  setQueue(songs: readonly Song[], index: number, label: string): void {
    set({ queue: makeQueue(songs, index, label) })
  },
  /** Move the queue's position (after the user or auto-advance picked another song in it). */
  setQueueIndex(index: number): void {
    set((s) => (s.queue ? { queue: { ...s.queue, index } } : {}))
  },
  /** If `songId` is in the current queue, point the queue at it; otherwise leave the queue alone. */
  followQueue(songId: number): boolean {
    const q = get().queue
    const next = q && seekQueue(q, songId)
    if (next) set({ queue: next })
    return !!next
  },
  clearQueue(): void {
    set({ queue: null })
  },

  /** Report a load failure (e.g. missing file) so the tab view shows it instead of crashing. */
  fail(message: string): void {
    set({ status: 'error', error: message, playing: false, countingIn: false })
  },

  togglePlay: () => engine?.togglePlay(),
  pause: () => engine?.pause(),
  stop: () => engine?.stop(),
  restart: () => engine?.restart(),
  previous: () => engine?.previous(),
  next: () => engine?.next(),
  seekMs: (ms: number) => engine?.seekMs(ms),

  setSpeed: (speed: number) => engine?.setSpeed(speed) ?? set({ speed: clampSpeed(speed) }),
  stepSpeed: (dir: 1 | -1) => player.setSpeed(stepSpeed(get().speed, dir)),
  resetSpeed: () => player.setSpeed(1),

  toggleMetronome: () => engine?.setMetronome(!get().metronomeOn),
  setMetronomeVolume: (v: number) => engine?.setMetronome(get().metronomeOn, v),
  toggleCountIn: () => engine?.setCountIn(!get().countInOn),
  toggleLoop: () => engine?.setLoop(!get().loopOn),
  setRange: (start: number, end: number) => engine?.setRange(start, end),
  clearRange: () => engine?.clearRange(),
  setMasterVolume: (v: number) => engine?.setMasterVolume(v),

  setTrackVolume: (index: number, volume: number) => engine?.setTrackVolume(index, volume),
  toggleMute: (index: number) => engine?.toggleMute(index),
  toggleSolo: (index: number) => engine?.toggleSolo(index),
  /** Practice a single track (render + play it alone); pass null to restore the full score and mix. */
  setPractice: (index: number | null) => engine?.setPractice(index),
  setSynthSource: (source: SynthSource) => engine?.setSynthSource(source),
  /** Hear a track from the synth or its stem MP3. */
  setTrackSource: (index: number, source: AudioSource) => engine?.setTrackSource(index, source),
  /** Hear the band from the synth or the master MP3. */
  setMasterSource: (source: AudioSource) => engine?.setMasterSource(source),

  /** Apply a start offset / sync points immediately (sync editor preview). Does not save. */
  setSync: (offsetMs: number, points: readonly SyncPointRow[]) => engine?.setSync(offsetMs, points),
  syncContext: () => engine?.syncContext() ?? null,
  seekToMeasure: (measure: number) => engine?.seekToMeasure(measure),
  /** Audio position in the MP3 file in ms, or null when MP3 audio isn't playing. */
  playheadFileMs: () => engine?.playheadFileMs() ?? null,
  seekFileMs: (fileMs: number) => engine?.seekFileMs(fileMs),
  /** The MP3 engine (null until MP3 audio has been used); for the sync editor's waveform and playhead. */
  mp3Engine: () => engine?.mp3Engine ?? null,
  ensureMp3Source: (id: 'master' | `track:${number}`) =>
    engine?.ensureSource(id) ?? Promise.resolve(false),

  setZoom: (zoom: number) => engine?.setZoom(zoom),
  setLayout: (layout: TabLayout) => engine?.setLayout(layout)
}

/** Test-only probes, installed when the e2e harness launched the app (see `window.api.app.diagnostics`). */
export interface TabKingDiagnostics {
  state(): ReturnType<typeof usePlayerStore.getState>
  timing(): ReturnType<PlayerEngine['diagnostics']> | null
  /** Start watching audio output for beeps; call the returned function to stop and get media-ms onsets. */
  probeOnsets(): (() => { mediaMs: number; freqHz: number; ctxTime: number }[]) | null
  cursorSample(): { ctxTime: number; outputLatency: number; tabMs: number } | null
  tabMsForFileMs(fileMs: number): number | null
  player: typeof player
  /** The pad every media position includes. */
  padMs: number
}

declare global {
  interface Window {
    __tabking?: TabKingDiagnostics
  }
}

export function installDiagnostics(padMs: number): void {
  window.__tabking = {
    state: () => usePlayerStore.getState(),
    timing: () => engine?.diagnostics() ?? null,
    probeOnsets: () => engine?.mp3Engine?.probeOnsets() ?? null,
    cursorSample: () => engine?.cursorSample() ?? null,
    tabMsForFileMs: (fileMs) => engine?.tabMsForFileMs(fileMs) ?? null,
    player,
    padMs
  }
}

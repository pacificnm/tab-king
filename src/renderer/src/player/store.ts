import { create } from 'zustand'
import type { AudioSource, Song, SyncPointRow, SynthSource } from '@shared/types'
import type { Section } from './player-math'

/** A track as shown in the track panel (TRK-1) with its persisted mix (TRK-2). */
export interface PanelTrack {
  index: number
  name: string
  instrument: string | null
  /** Which audio represents this track: the synth or its stem MP3 (TRK-4). */
  source: AudioSource
  /** A stem MP3 is attached and usable. */
  hasMp3: boolean
  /** 1 = 100%. */
  volume: number
  muted: boolean
  solo: boolean
}

export type PlaybackMode = 'synth' | 'mp3'
export type AudioStatus = 'idle' | 'loading' | 'ready'

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error'
export type TabLayout = 'page' | 'horizontal'

export interface PlayerState {
  /** Song most recently opened in the player. */
  song: Song | null
  /** Bumped on every open so re-opening the same song reloads it. */
  openToken: number
  /** Start playing as soon as the song is ready. */
  autoplay: boolean
  status: PlayerStatus
  error: string | null

  playing: boolean
  countingIn: boolean
  positionMs: number
  durationMs: number
  /** 1-based; 0 when nothing is loaded. */
  currentMeasure: number
  measureCount: number
  sections: Section[]

  tracks: PanelTrack[]
  /** Track shown/played alone in the practice view (TRK-5); null = full score and mix. */
  practiceTrack: number | null
  synthSource: SynthSource
  /** The song has a usable attached MIDI file (TRK-6). */
  hasMidi: boolean
  midiError: string | null

  /** Which audio represents the whole band: the synth or the master MP3 (TRK-4). */
  masterSource: AudioSource
  hasMaster: boolean
  /** Which engine is the clock right now (decided by the playback plan). */
  playbackMode: PlaybackMode
  audioStatus: AudioStatus
  /** Problems loading MP3 audio; playback falls back to the synth. */
  audioError: string | null
  /** Tracks the user wants to hear from the synth while MP3 audio plays (they stay silent). */
  silencedSynthTracks: number[]
  syncOffsetMs: number
  syncPoints: SyncPointRow[]

  speed: number
  metronomeOn: boolean
  metronomeVolume: number
  countInOn: boolean
  loopOn: boolean
  /** Selected/looped 1-based inclusive measure range, if any. */
  range: { start: number; end: number } | null
  masterVolume: number
  zoom: number
  layout: TabLayout
}

export const initialPlayerState: PlayerState = {
  song: null,
  openToken: 0,
  autoplay: false,
  status: 'idle',
  error: null,
  playing: false,
  countingIn: false,
  positionMs: 0,
  durationMs: 0,
  currentMeasure: 0,
  measureCount: 0,
  sections: [],
  tracks: [],
  practiceTrack: null,
  synthSource: 'gp',
  hasMidi: false,
  midiError: null,
  masterSource: 'synth',
  hasMaster: false,
  playbackMode: 'synth',
  audioStatus: 'idle',
  audioError: null,
  silencedSynthTracks: [],
  syncOffsetMs: 0,
  syncPoints: [],
  speed: 1,
  metronomeOn: false,
  metronomeVolume: 0.6,
  countInOn: false,
  loopOn: false,
  range: null,
  masterVolume: 0.8,
  zoom: 1,
  layout: 'page'
}

/** UI state of the player. Written by the engine/controller only; components just read it. */
export const usePlayerStore = create<PlayerState>(() => initialPlayerState)

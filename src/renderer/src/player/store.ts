import { create } from 'zustand'
import type { Song, SynthSource } from '@shared/types'
import type { Section } from './player-math'

/** A track as shown in the track panel (TRK-1) with its persisted mix (TRK-2). */
export interface PanelTrack {
  index: number
  name: string
  instrument: string | null
  /** 1 = 100%. */
  volume: number
  muted: boolean
  solo: boolean
}

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

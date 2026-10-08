import { create } from 'zustand'
import type { Song } from '@shared/types'
import type { Section } from './player-math'

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

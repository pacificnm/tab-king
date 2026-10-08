import type { AudioSource } from '@shared/types'
import { audibleTracks, effectiveMix, type EffectiveTrackMix } from './mix-math'

export interface PlanTrack {
  index: number
  /** 1 = 100%. */
  volume: number
  muted: boolean
  solo: boolean
  source: AudioSource
  /** A stem MP3 is attached to this track. */
  hasMp3: boolean
}

export interface PlanInput {
  tracks: readonly PlanTrack[]
  masterSource: AudioSource
  hasMaster: boolean
  /** Track shown/played alone (TRK-5), or null. */
  practice: number | null
}

export type Mp3SourceId = 'master' | `track:${number}`

export interface PlaybackPlan {
  /**
   * `synth`: alphaTab's synthesizer plays (the mix is in `synthMix`).
   * `mp3`: our MP3 engine is the clock and alphaTab follows it as external media.
   */
  mode: 'synth' | 'mp3'
  synthMix: EffectiveTrackMix[]
  /** MP3 sources that are heard and at what gain; every other loaded source is silent. */
  mp3: { id: Mp3SourceId; gain: number }[]
  /**
   * Tracks the user wants to hear from the synth while MP3 audio is playing. alphaTab's external-media mode has no
   * synth, so these stay silent; the UI says so instead of dropping them without a word.
   */
  silencedSynthTracks: number[]
}

const stemId = (index: number): Mp3SourceId => `track:${index}`
const usesStem = (t: PlanTrack): boolean => t.source === 'mp3' && t.hasMp3

/**
 * Which audio is heard (TRK-4, TRK-5). Exactly one source is audible per track:
 * - Practicing a track plays that track's stem if it uses one, otherwise the synth; the master is silent.
 * - A master MP3 selected as the source plays alone — it is one pre-mixed recording, so per-track mute/solo/volume
 *   cannot apply to it.
 * - Otherwise each audible track plays from its own source. If any plays from a stem the MP3 engine runs and
 *   synth-sourced tracks are reported in `silencedSynthTracks`.
 */
export function planPlayback({
  tracks,
  masterSource,
  hasMaster,
  practice
}: PlanInput): PlaybackPlan {
  const mixState = tracks.map((t) => ({
    index: t.index,
    volume: t.volume,
    muted: t.muted,
    solo: t.solo
  }))
  const synthPlan = (): PlaybackPlan => ({
    mode: 'synth',
    synthMix: effectiveMix(mixState, practice),
    mp3: [],
    silencedSynthTracks: []
  })

  if (practice !== null) {
    const t = tracks.find((x) => x.index === practice)
    if (t && usesStem(t)) {
      return {
        mode: 'mp3',
        synthMix: effectiveMix(mixState, practice),
        mp3: [{ id: stemId(t.index), gain: t.volume }],
        silencedSynthTracks: []
      }
    }
    return synthPlan()
  }

  if (masterSource === 'mp3' && hasMaster) {
    return {
      mode: 'mp3',
      synthMix: effectiveMix(mixState, null),
      mp3: [{ id: 'master', gain: 1 }],
      silencedSynthTracks: []
    }
  }

  const audible = new Set(audibleTracks(mixState, null))
  const heard = tracks.filter((t) => audible.has(t.index))
  const stems = heard.filter(usesStem)
  if (stems.length === 0) return synthPlan()
  return {
    mode: 'mp3',
    synthMix: effectiveMix(mixState, null),
    mp3: stems.map((t) => ({ id: stemId(t.index), gain: t.volume })),
    silencedSynthTracks: heard.filter((t) => !usesStem(t)).map((t) => t.index)
  }
}

/** MP3 sources the engine must have loaded to cover every plan the user can reach by changing mute/solo/practice. */
export function stemsToLoad(
  tracks: readonly PlanTrack[],
  masterSource: AudioSource,
  hasMaster: boolean
): Mp3SourceId[] {
  const ids: Mp3SourceId[] = []
  if (hasMaster && masterSource === 'mp3') ids.push('master')
  for (const t of tracks) if (t.hasMp3) ids.push(stemId(t.index))
  return ids
}

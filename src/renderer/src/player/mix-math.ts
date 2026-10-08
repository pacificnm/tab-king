export interface TrackMixState {
  index: number
  /** 1 = 100%. */
  volume: number
  muted: boolean
  solo: boolean
}

export interface EffectiveTrackMix {
  index: number
  volume: number
  mute: boolean
  solo: boolean
}

export const MIN_TRACK_VOLUME = 0
export const MAX_TRACK_VOLUME = 1.5

export const clampTrackVolume = (v: number): number =>
  Math.round(Math.min(MAX_TRACK_VOLUME, Math.max(MIN_TRACK_VOLUME, v)) * 20) / 20

/**
 * What to tell the synth for each track. The single-track practice view (TRK-5) temporarily overrides the
 * user's solo/mute choices — only that track sounds — without touching them, so deselecting restores the mix.
 */
export function effectiveMix(
  tracks: readonly TrackMixState[],
  practice: number | null
): EffectiveTrackMix[] {
  return tracks.map((t) => {
    if (practice !== null) {
      const on = t.index === practice
      return { index: t.index, volume: t.volume, mute: !on, solo: on }
    }
    return { index: t.index, volume: t.volume, mute: t.muted, solo: t.solo }
  })
}

/** Indexes of the tracks that will actually be heard (alphaTab rule: mute always wins, any solo silences the rest). */
export function audibleTracks(tracks: readonly TrackMixState[], practice: number | null): number[] {
  const mix = effectiveMix(tracks, practice)
  const anySolo = mix.some((t) => t.solo && !t.mute)
  return mix.filter((t) => !t.mute && (!anySolo || t.solo)).map((t) => t.index)
}

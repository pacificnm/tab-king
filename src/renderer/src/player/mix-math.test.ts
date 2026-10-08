import { describe, expect, it } from 'vitest'
import { audibleTracks, clampTrackVolume, effectiveMix, type TrackMixState } from './mix-math'

const t = (index: number, over: Partial<TrackMixState> = {}): TrackMixState => ({
  index,
  volume: 1,
  muted: false,
  solo: false,
  ...over
})
const three = [t(0), t(1), t(2)]

describe('audibleTracks', () => {
  it('plays everything by default', () => {
    expect(audibleTracks(three, null)).toEqual([0, 1, 2])
  })

  it('mute removes a track; solo silences the rest; mute beats solo', () => {
    expect(audibleTracks([t(0, { muted: true }), t(1), t(2)], null)).toEqual([1, 2])
    expect(audibleTracks([t(0), t(1, { solo: true }), t(2)], null)).toEqual([1])
    expect(audibleTracks([t(0, { solo: true }), t(1, { solo: true }), t(2)], null)).toEqual([0, 1])
    expect(audibleTracks([t(0, { solo: true, muted: true }), t(1), t(2)], null)).toEqual([1, 2])
  })
})

describe('single-track practice view (TRK-5)', () => {
  it('plays only the practiced track, even if it was muted or others were soloed', () => {
    const tracks = [t(0, { solo: true }), t(1, { muted: true }), t(2)]
    expect(audibleTracks(tracks, 1)).toEqual([1])
    expect(audibleTracks(tracks, 2)).toEqual([2])
  })

  it('leaves the user mix untouched so deselecting restores it', () => {
    const tracks = [t(0, { solo: true, volume: 0.5 }), t(1, { muted: true }), t(2)]
    const snapshot = structuredClone(tracks)
    effectiveMix(tracks, 2)
    expect(tracks).toEqual(snapshot)
    expect(effectiveMix(tracks, null)).toEqual([
      { index: 0, volume: 0.5, mute: false, solo: true },
      { index: 1, volume: 1, mute: true, solo: false },
      { index: 2, volume: 1, mute: false, solo: false }
    ])
  })

  it('keeps per-track volume while practicing', () => {
    expect(effectiveMix([t(0, { volume: 0.4 }), t(1)], 0)[0]).toEqual({
      index: 0,
      volume: 0.4,
      mute: false,
      solo: true
    })
  })
})

describe('clampTrackVolume', () => {
  it('clamps to 0–150% on a 5% grid', () => {
    expect(clampTrackVolume(-1)).toBe(0)
    expect(clampTrackVolume(3)).toBe(1.5)
    expect(clampTrackVolume(0.63)).toBe(0.65)
  })
})

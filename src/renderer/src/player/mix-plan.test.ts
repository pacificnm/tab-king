import { describe, expect, it } from 'vitest'
import { planPlayback, stemsToLoad, type PlanInput, type PlanTrack } from './mix-plan'

const t = (index: number, over: Partial<PlanTrack> = {}): PlanTrack => ({
  index,
  volume: 1,
  muted: false,
  solo: false,
  source: 'synth',
  hasMp3: false,
  ...over
})
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  tracks: [t(0), t(1), t(2)],
  masterSource: 'synth',
  hasMaster: false,
  practice: null,
  ...over
})

describe('planPlayback — synth', () => {
  it('plays the synth when nothing uses MP3', () => {
    const p = planPlayback(input())
    expect(p).toMatchObject({ mode: 'synth', mp3: [], silencedSynthTracks: [] })
    expect(p.synthMix.every((m) => !m.mute && !m.solo)).toBe(true)
  })

  it('ignores a stem the track has but does not use, and a master that is not the source', () => {
    const p = planPlayback(
      input({
        tracks: [t(0, { hasMp3: true, source: 'synth' })],
        hasMaster: true,
        masterSource: 'synth'
      })
    )
    expect(p.mode).toBe('synth')
  })

  it('a source of mp3 without a stem falls back to the synth', () => {
    expect(planPlayback(input({ tracks: [t(0, { source: 'mp3', hasMp3: false })] })).mode).toBe(
      'synth'
    )
    expect(planPlayback(input({ masterSource: 'mp3', hasMaster: false })).mode).toBe('synth')
  })
})

describe('planPlayback — master MP3', () => {
  it('plays the master alone; per-track mixing does not apply to it', () => {
    const p = planPlayback(
      input({
        masterSource: 'mp3',
        hasMaster: true,
        tracks: [t(0, { muted: true }), t(1, { hasMp3: true, source: 'mp3' }), t(2)]
      })
    )
    expect(p).toMatchObject({
      mode: 'mp3',
      mp3: [{ id: 'master', gain: 1 }],
      silencedSynthTracks: []
    })
  })
})

describe('planPlayback — stems', () => {
  const stems = [
    t(0, { source: 'mp3', hasMp3: true, volume: 0.5 }),
    t(1, { source: 'mp3', hasMp3: true }),
    t(2)
  ]

  it('plays the audible stems at their track volume', () => {
    const p = planPlayback(input({ tracks: stems }))
    expect(p.mode).toBe('mp3')
    expect(p.mp3).toEqual([
      { id: 'track:0', gain: 0.5 },
      { id: 'track:1', gain: 1 }
    ])
    expect(p.silencedSynthTracks).toEqual([2]) // synth + MP3 can't play together
  })

  it('mute and solo choose which stems are heard', () => {
    const muted = planPlayback(
      input({ tracks: [t(0, { source: 'mp3', hasMp3: true, muted: true }), ...stems.slice(1)] })
    )
    expect(muted.mp3.map((s) => s.id)).toEqual(['track:1'])
    const solo = planPlayback(
      input({ tracks: [stems[0]!, t(1, { source: 'mp3', hasMp3: true, solo: true }), stems[2]!] })
    )
    expect(solo.mp3.map((s) => s.id)).toEqual(['track:1'])
    expect(solo.silencedSynthTracks).toEqual([])
  })

  it('soloing a synth-only track while others use stems leaves the synth, so it plays', () => {
    const p = planPlayback(input({ tracks: [stems[0]!, stems[1]!, t(2, { solo: true })] }))
    expect(p.mode).toBe('synth')
  })
})

describe('planPlayback — practice view (TRK-5)', () => {
  it("plays only that track's stem, silencing the master", () => {
    const p = planPlayback(
      input({
        masterSource: 'mp3',
        hasMaster: true,
        tracks: [t(0), t(1, { source: 'mp3', hasMp3: true, volume: 0.8 }), t(2)],
        practice: 1
      })
    )
    expect(p).toMatchObject({
      mode: 'mp3',
      mp3: [{ id: 'track:1', gain: 0.8 }],
      silencedSynthTracks: []
    })
  })

  it('uses the synth for a practiced track without a stem, even when the master is the source', () => {
    const p = planPlayback(input({ masterSource: 'mp3', hasMaster: true, practice: 2 }))
    expect(p.mode).toBe('synth')
    expect(p.synthMix.find((m) => m.index === 2)).toMatchObject({ solo: true, mute: false })
    expect(p.synthMix.find((m) => m.index === 0)).toMatchObject({ mute: true })
  })

  it('returning to the full mix restores the master', () => {
    const base = input({
      masterSource: 'mp3',
      hasMaster: true,
      tracks: [t(0, { source: 'mp3', hasMp3: true }), t(1)]
    })
    expect(planPlayback({ ...base, practice: 0 }).mp3.map((s) => s.id)).toEqual(['track:0'])
    expect(planPlayback({ ...base, practice: null }).mp3.map((s) => s.id)).toEqual(['master'])
  })

  it('an unknown practice index falls back to synth', () => {
    expect(planPlayback(input({ practice: 99 })).mode).toBe('synth')
  })
})

describe('stemsToLoad', () => {
  it('lists the master (when it is the source) and every attached stem', () => {
    expect(
      stemsToLoad([t(0, { hasMp3: true }), t(1), t(2, { hasMp3: true })], 'mp3', true)
    ).toEqual(['master', 'track:0', 'track:2'])
    expect(stemsToLoad([t(0)], 'synth', true)).toEqual([])
  })
})

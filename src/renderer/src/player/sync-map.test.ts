import { describe, expect, it } from 'vitest'
import {
  buildSyncMap,
  measureToMp3Ms,
  mp3MsToMeasure,
  mp3MsToTabMs,
  tabMsToMp3Ms,
  validateSyncPoints
} from './sync-map'

// 8 bars of 4/4 at 120 bpm: 2000 ms per bar, 16 s total
const bars = Array.from({ length: 8 }, (_, i) => i * 2000)
const END = 16000
const map = (offsetMs: number, points: { measure: number; mp3Ms: number }[] = []) =>
  buildSyncMap({ offsetMs, points, barStartsMs: bars, tabEndMs: END })

describe('buildSyncMap', () => {
  it('with only an offset, tab time is shifted 1:1 (including negative offsets)', () => {
    const m = map(1500)
    expect(tabMsToMp3Ms(m, 0)).toBe(1500)
    expect(tabMsToMp3Ms(m, 7000)).toBe(8500)
    expect(tabMsToMp3Ms(m, 16000)).toBe(17500)
    expect(tabMsToMp3Ms(m, 20000)).toBe(21500) // beyond the end keeps the ratio
    const neg = map(-500)
    expect(tabMsToMp3Ms(neg, 0)).toBe(-500)
    expect(tabMsToMp3Ms(neg, 1000)).toBe(500)
  })

  it('interpolates linearly between points and continues the last ratio afterwards', () => {
    // measure 5 (tab 8000) is at mp3 9000
    const m = map(1000, [{ measure: 5, mp3Ms: 9000 }])
    expect(tabMsToMp3Ms(m, 4000)).toBe(5000) // halfway
    expect(tabMsToMp3Ms(m, 8000)).toBe(9000)
    // the offset→bar 5 segment ran at ratio 1 (1000→9000 over 8000 ms), so it simply continues
    expect(tabMsToMp3Ms(m, 12000)).toBe(13000)
  })

  it('uses the last segment ratio for extrapolation, not alphaTab-style "fit to media length"', () => {
    const m = map(0, [{ measure: 5, mp3Ms: 8800 }]) // 10% slower than the tab in the first half
    const last = m.anchors[m.anchors.length - 1]!
    expect(last).toMatchObject({ tabMs: END, barIndex: 7, barPosition: 1 })
    expect(last.mp3Ms).toBeCloseTo(8800 + 8000 * 1.1)
  })

  it('ignores non-monotonic or out-of-range points', () => {
    const m = map(1000, [
      { measure: 5, mp3Ms: 9000 },
      { measure: 3, mp3Ms: 9500 }, // later in audio than measure 5's
      { measure: 99, mp3Ms: 1 },
      { measure: 1, mp3Ms: 1 }
    ])
    // sorted by measure, so measure 3 is accepted and measure 5 (earlier in the audio than 3) is dropped
    expect(m.anchors.map((a) => a.barIndex)).toEqual([0, 2, 7])
  })

  it('handles an empty score', () => {
    expect(buildSyncMap({ offsetMs: 0, points: [], barStartsMs: [], tabEndMs: 0 }).anchors).toEqual(
      []
    )
    expect(tabMsToMp3Ms({ anchors: [] }, 123)).toBe(123)
  })
})

describe('conversions', () => {
  const m = map(1000, [
    { measure: 3, mp3Ms: 5500 },
    { measure: 6, mp3Ms: 11000 }
  ])

  it('round-trips and is monotonic', () => {
    let prev = -Infinity
    for (let tab = -1000; tab <= 18000; tab += 250) {
      const mp3 = tabMsToMp3Ms(m, tab)
      expect(mp3).toBeGreaterThan(prev)
      prev = mp3
      expect(mp3MsToTabMs(m, mp3)).toBeCloseTo(tab, 6)
    }
  })

  it('lands each sync point measure on its mp3 time', () => {
    expect(measureToMp3Ms(m, bars, END, 1)).toBe(1000)
    expect(measureToMp3Ms(m, bars, END, 3)).toBe(5500)
    expect(measureToMp3Ms(m, bars, END, 6)).toBe(11000)
    expect(measureToMp3Ms(m, bars, END, 3, 0.5)).toBeGreaterThan(5500)
  })

  it('finds the measure and fraction at an mp3 time', () => {
    expect(mp3MsToMeasure(m, bars, END, 5500)).toEqual({ measure: 3, fraction: 0 })
    const mid = mp3MsToMeasure(m, bars, END, (5500 + 11000) / 2 - 0.0001)
    expect(mid.measure).toBeGreaterThanOrEqual(4)
    expect(mid.measure).toBeLessThanOrEqual(5)
    expect(mp3MsToMeasure(m, bars, END, 0).measure).toBe(1)
    expect(mp3MsToMeasure(m, bars, END, 999999).measure).toBe(8)
  })
})

describe('validateSyncPoints', () => {
  it('accepts a good list', () => {
    expect(
      validateSyncPoints(
        1000,
        [
          { measure: 3, mp3Ms: 5000 },
          { measure: 6, mp3Ms: 11000 }
        ],
        8,
        20000
      )
    ).toEqual([])
  })

  it('reports out-of-range, duplicate, non-monotonic and past-the-end points', () => {
    const problems = validateSyncPoints(
      1000,
      [
        { measure: 1, mp3Ms: 5 },
        { measure: 9, mp3Ms: 5 },
        { measure: 3, mp3Ms: 5000 },
        { measure: 3, mp3Ms: 5100 },
        { measure: 4, mp3Ms: 4000 },
        { measure: 5, mp3Ms: 99999 },
        { measure: 6, mp3Ms: -1 }
      ],
      8,
      20000
    )
    const by = (m: number) => problems.filter((p) => p.measure === m).map((p) => p.message)
    expect(by(1)[0]).toMatch(/outside 2–8/)
    expect(by(9)[0]).toMatch(/outside 2–8/)
    expect(by(3).some((s) => /more than one/.test(s))).toBe(true)
    expect(by(4)[0]).toMatch(/later in the audio than measure 3/)
    expect(by(5)[0]).toMatch(/past the end/)
    expect(by(6)[0]).toMatch(/zero or more/)
  })

  it('requires the first point to follow the start offset', () => {
    expect(validateSyncPoints(2000, [{ measure: 2, mp3Ms: 1500 }], 8)[0]?.message).toMatch(
      /start offset/
    )
  })
})

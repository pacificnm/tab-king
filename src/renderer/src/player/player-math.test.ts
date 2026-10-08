import { describe, expect, it } from 'vitest'
import {
  barAtTick,
  clampSpeed,
  formatTime,
  nextBarTick,
  normalizeRange,
  prevBarTick,
  sectionsFromMarkers,
  stepSpeed,
  tempoAtBar,
  type BarSpan
} from './player-math'

const spans: BarSpan[] = [0, 1, 2, 3].map((i) => ({
  index: i,
  start: i * 3840,
  end: (i + 1) * 3840
}))

describe('measure navigation', () => {
  it('finds the measure containing a tick, clamped at the ends', () => {
    expect(barAtTick(spans, 0)).toBe(0)
    expect(barAtTick(spans, 3839)).toBe(0)
    expect(barAtTick(spans, 3840)).toBe(1)
    expect(barAtTick(spans, 99999)).toBe(3)
    expect(barAtTick(spans, -5)).toBe(0)
    expect(barAtTick([], 10)).toBe(0)
  })

  it('Previous restarts the measure, or goes back when already at its start', () => {
    expect(prevBarTick(spans, 3840 + 2000)).toBe(3840)
    expect(prevBarTick(spans, 3840 + 100)).toBe(0)
    expect(prevBarTick(spans, 3840)).toBe(0)
    expect(prevBarTick(spans, 50)).toBe(0)
    expect(prevBarTick([], 50)).toBe(0)
  })

  it('Next goes to the following measure and stops on the last', () => {
    expect(nextBarTick(spans, 10)).toBe(3840)
    expect(nextBarTick(spans, 3 * 3840 + 5)).toBeNull()
  })
})

describe('speed', () => {
  it('clamps to 25–200% on a 5% grid', () => {
    expect(clampSpeed(0.1)).toBe(0.25)
    expect(clampSpeed(3)).toBe(2)
    expect(clampSpeed(0.62)).toBe(0.6)
    expect(stepSpeed(1, 1)).toBe(1.05)
    expect(stepSpeed(0.25, -1)).toBe(0.25)
    expect(stepSpeed(2, 1)).toBe(2)
    expect(stepSpeed(0.6, -1)).toBe(0.55)
  })
})

describe('tempoAtBar', () => {
  it('follows tempo automations up to the given measure', () => {
    const bars = [
      { tempoAutomations: [] },
      { tempoAutomations: [{ value: 90 }] },
      { tempoAutomations: [] }
    ]
    expect(tempoAtBar(120, bars, 0)).toBe(120)
    expect(tempoAtBar(120, bars, 1)).toBe(90)
    expect(tempoAtBar(120, bars, 2)).toBe(90)
    expect(tempoAtBar(120, [], 5)).toBe(120)
  })
})

describe('formatTime', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(61_900)).toBe('1:01')
    expect(formatTime(3_725_000)).toBe('1:02:05')
    expect(formatTime(-5)).toBe('0:00')
  })
})

describe('sections and ranges', () => {
  it('builds inclusive 1-based section ranges', () => {
    expect(sectionsFromMarkers([null, 'Intro', null, 'Verse', null, null])).toEqual([
      { name: 'Intro', startMeasure: 2, endMeasure: 3 },
      { name: 'Verse', startMeasure: 4, endMeasure: 6 }
    ])
    expect(sectionsFromMarkers([null, null])).toEqual([])
  })

  it('normalises typed ranges', () => {
    expect(normalizeRange(6, 3, 10)).toEqual({ start: 3, end: 6 })
    expect(normalizeRange(0, 99, 10)).toEqual({ start: 1, end: 10 })
    expect(normalizeRange(NaN, 2, 10)).toBeNull()
    expect(normalizeRange(1, 2, 0)).toBeNull()
  })
})

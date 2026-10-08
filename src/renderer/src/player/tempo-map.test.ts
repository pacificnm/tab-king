import { describe, expect, it } from 'vitest'
import { buildTickToMs } from './tempo-map'

describe('buildTickToMs', () => {
  it('is linear at a constant tempo (960 ticks per quarter)', () => {
    const f = buildTickToMs([{ tick: 0, bpm: 120 }])
    expect(f(0)).toBe(0)
    expect(f(960)).toBe(500)
    expect(f(3840)).toBe(2000)
  })

  it('accumulates across tempo changes', () => {
    const f = buildTickToMs([
      { tick: 0, bpm: 120 },
      { tick: 3840, bpm: 60 } // after one bar of 120bpm (2000ms), quarters take 1000ms
    ])
    expect(f(3840)).toBe(2000)
    expect(f(3840 + 960)).toBe(3000)
    expect(f(1920)).toBe(1000)
  })

  it('defaults to 120 bpm with no events and sorts input', () => {
    expect(buildTickToMs([])(960)).toBe(500)
    const f = buildTickToMs([
      { tick: 960, bpm: 60 },
      { tick: 0, bpm: 120 }
    ])
    expect(f(1920)).toBe(500 + 1000)
  })
})

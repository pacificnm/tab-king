import { describe, expect, it } from 'vitest'
import { columnPeaks, formatMs, msToX, viewAround, xToMs } from './waveform'

describe('viewAround', () => {
  it('centres the window and clamps it to the audio', () => {
    expect(viewAround(10000, 4000, 60000)).toEqual({ startMs: 8000, endMs: 12000 })
    expect(viewAround(500, 4000, 60000)).toEqual({ startMs: 0, endMs: 4000 })
    expect(viewAround(59000, 4000, 60000)).toEqual({ startMs: 56000, endMs: 60000 })
    expect(viewAround(1000, 10000, 3000)).toEqual({ startMs: 0, endMs: 3000 }) // shorter than the window
  })
})

describe('x <-> ms', () => {
  it('are inverses', () => {
    const view = { startMs: 2000, endMs: 6000 }
    expect(msToX(4000, 800, view)).toBe(400)
    expect(xToMs(400, 800, view)).toBe(4000)
    expect(xToMs(msToX(5123, 640, view), 640, view)).toBeCloseTo(5123)
  })
})

describe('columnPeaks', () => {
  it('takes the largest peak in each column (100 peaks per second)', () => {
    const peaks = new Float32Array(300) // 3 s
    peaks[50] = 0.5 // 500 ms
    peaks[250] = 1 // 2500 ms
    const cols = columnPeaks(peaks, { startMs: 0, endMs: 3000 }, 3) // 1 s per column
    expect(Array.from(cols)).toEqual([0.5, 0, 1])
  })

  it('is silent outside the audio', () => {
    const cols = columnPeaks(new Float32Array(100), { startMs: 5000, endMs: 6000 }, 10)
    expect(Array.from(cols).every((v) => v === 0)).toBe(true)
  })
})

describe('formatMs', () => {
  it('formats m:ss.mmm with a sign', () => {
    expect(formatMs(0)).toBe('0:00.000')
    expect(formatMs(61234)).toBe('1:01.234')
    expect(formatMs(-250)).toBe('-0:00.250')
  })
})

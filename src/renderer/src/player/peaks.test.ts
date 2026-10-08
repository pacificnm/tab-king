import { describe, expect, it } from 'vitest'
import { computePeaks } from './peaks'

describe('computePeaks', () => {
  it('takes the largest absolute sample in each slice', () => {
    const data = new Float32Array([0.1, -0.5, 0.2, 0.3, 0, 0, -0.9, 0.4])
    const peaks = computePeaks(data, 4)
    ;[0.5, 0.3, 0, 0.9].forEach((want, i) => expect(peaks[i]).toBeCloseTo(want, 5))
  })

  it('handles more buckets than samples, empty input and zero buckets', () => {
    expect(Array.from(computePeaks(new Float32Array([0.25, -0.75]), 4))).toEqual([
      0.25, 0.25, 0.75, 0.75
    ])
    expect(computePeaks(new Float32Array(), 3)).toHaveLength(3)
    expect(computePeaks(new Float32Array([1]), 0)).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import type { Song } from '@shared/types'
import { hasSiblings, makeQueue, seekQueue, stepIndex } from './queue'

const songs = [1, 2, 3].map((id) => ({ id, title: `S${id}` }) as Song)

describe('queue', () => {
  it('starts where asked and clamps a bad start', () => {
    expect(makeQueue(songs, 1, 'Album')?.index).toBe(1)
    expect(makeQueue(songs, 99, 'Album')?.index).toBe(2)
    expect(makeQueue(songs, -3, 'Album')?.index).toBe(0)
    expect(makeQueue([], 0, 'Empty')).toBeNull()
  })

  it("does not alias the caller's array", () => {
    const input = [...songs]
    const q = makeQueue(input, 0, 'x')!
    input.pop()
    expect(q.songs).toHaveLength(3)
  })

  it('steps forwards and backwards and stops at the ends', () => {
    const q = makeQueue(songs, 1, 'x')!
    expect(stepIndex(q, 1)).toBe(2)
    expect(stepIndex(q, -1)).toBe(0)
    expect(stepIndex({ ...q, index: 2 }, 1)).toBeNull()
    expect(stepIndex({ ...q, index: 0 }, -1)).toBeNull()
  })

  it('knows when there is more than one song', () => {
    expect(hasSiblings(makeQueue(songs, 0, 'x'))).toBe(true)
    expect(hasSiblings(makeQueue([songs[0]!], 0, 'x'))).toBe(false)
    expect(hasSiblings(null)).toBe(false)
  })

  it('re-points at a song from the same list, or says it is not there', () => {
    const q = makeQueue(songs, 0, 'x')!
    expect(seekQueue(q, 3)?.index).toBe(2)
    expect(seekQueue(q, 99)).toBeNull()
  })
})

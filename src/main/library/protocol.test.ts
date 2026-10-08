import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ protocol: {} }))
const { parseRange, relPathFromUrl } = await import('./protocol')

describe('relPathFromUrl', () => {
  it('decodes valid library URLs', () => {
    expect(relPathFromUrl('tabking://library/Rush/Moving%20Pictures/cover.jpg')).toBe(
      'Rush/Moving Pictures/cover.jpg'
    )
  })
  it('normalises dot segments inside the library host', () => {
    expect(relPathFromUrl('tabking://library/../secret')).toBe('secret')
    expect(relPathFromUrl('tabking://library/a/%2e%2e/b')).toBe('b')
  })
  it('rejects traversal, wrong host/scheme and empty segments', () => {
    for (const u of [
      'tabking://library/a%2F..%2Fb',
      'tabking://library/a%5Cb',
      'tabking://other/a',
      'http://library/a',
      'tabking://library/',
      'tabking://library/a//b',
      'tabking://library/%00',
      'not a url'
    ])
      expect(relPathFromUrl(u), u).toBeNull()
  })
})

describe('parseRange', () => {
  it('parses start-end, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=500-5000', 1000)).toEqual({ start: 500, end: 999 })
  })
  it('rejects unsatisfiable or malformed ranges', () => {
    for (const h of ['bytes=1000-', 'bytes=5-2', 'bytes=-', 'items=0-1', 'bytes=0-1,5-6'])
      expect(parseRange(h, 1000), h).toBeNull()
  })
})

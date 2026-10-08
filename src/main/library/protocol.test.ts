import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ protocol: {} }))
const { parseRange, parseMediaUrl } = await import('./protocol')
const relPathFromUrl = (u: string): string | null => parseMediaUrl(u)?.rel ?? null

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

describe('parseMediaUrl', () => {
  it('distinguishes the library and bundled-app hosts', () => {
    expect(parseMediaUrl('tabking://app/soundfont/sonivox.sf3')).toEqual({
      host: 'app',
      rel: 'soundfont/sonivox.sf3'
    })
    expect(parseMediaUrl('tabking://library/a/b.gp')).toEqual({ host: 'library', rel: 'a/b.gp' })
    expect(parseMediaUrl('tabking://soundfonts/My%20Bank.sf2')).toEqual({
      host: 'soundfonts',
      rel: 'My Bank.sf2'
    })
    expect(parseMediaUrl('tabking://soundfonts/../x.sf2')).toBeNull()
    expect(parseMediaUrl('tabking://evil/a')).toBeNull()
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

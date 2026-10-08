import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LibraryStore, sanitizeSegment } from './store'

let dir: string
let store: LibraryStore
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tabking-store-'))
  store = new LibraryStore(join(dir, 'lib'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('sanitizeSegment', () => {
  it('strips illegal characters, dots and reserved names', () => {
    expect(sanitizeSegment('AC/DC: Live?')).toBe('AC_DC_ Live_')
    expect(sanitizeSegment('..hidden. ')).toBe('hidden')
    expect(sanitizeSegment('CON')).toBe('CON_')
    expect(sanitizeSegment('   ')).toBe('Unknown')
    expect(sanitizeSegment('x'.repeat(200))).toHaveLength(80)
  })
})

describe('LibraryStore', () => {
  it('rejects paths that escape the root', () => {
    for (const bad of ['', '..', '../x', 'a/../../x', '/etc/passwd', 'a/../..'])
      expect(() => store.resolve(bad), bad).toThrow()
    expect(store.exists('../x')).toBe(false)
    expect(() => store.resolve('a/b.gp')).not.toThrow()
  })

  it('allocates collision-safe song dirs', () => {
    expect(store.allocateSongDir('Rush', 'Moving Pictures', 'YYZ')).toBe('Rush/Moving Pictures/YYZ')
    expect(store.allocateSongDir('Rush', 'Moving Pictures', 'YYZ')).toBe(
      'Rush/Moving Pictures/YYZ (2)'
    )
    expect(store.allocateSongDir('Rush', null, 'Solo')).toBe('Rush/Solo')
  })

  it('copies without overwriting, writes files, and prunes empty parents on remove', () => {
    const src = join(dir, 'song.gp')
    writeFileSync(src, 'data')
    const d = store.allocateSongDir('A', 'B', 'C')
    const a = store.copyIn(src, d)
    const b = store.copyIn(src, d)
    expect([a, b]).toEqual(['A/B/C/song.gp', 'A/B/C/song (2).gp'])
    expect(readFileSync(store.resolve(a), 'utf8')).toBe('data')
    store.writeFile('A/B/cover.jpg', new Uint8Array([1]))
    store.remove(a)
    store.remove(b)
    expect(existsSync(store.resolve('A/B/C'))).toBe(false)
    expect(existsSync(store.resolve('A/B/cover.jpg'))).toBe(true)
    store.remove('A/B/cover.jpg')
    expect(existsSync(join(store.root, 'A'))).toBe(false)
    expect(existsSync(store.root)).toBe(true)
  })

  it('does not prune non-empty or foreign dirs', () => {
    mkdirSync(join(store.root, 'X'))
    writeFileSync(join(store.root, 'X', 'keep.txt'), '')
    store.writeFile('X/f.gp', new Uint8Array())
    store.remove('X/f.gp')
    expect(existsSync(join(store.root, 'X', 'keep.txt'))).toBe(true)
  })
})

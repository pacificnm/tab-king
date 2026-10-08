import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MARKER,
  checkTarget,
  copyLibrary,
  ensureMarker,
  removeCopied,
  scanFiles
} from './library-location'

let tmp: string
let lib: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'tk-loc-'))
  lib = join(tmp, 'lib')
  mkdirSync(join(lib, 'A', 'B'), { recursive: true })
  writeFileSync(join(lib, 'A', 'B', 'x.gp'), 'one')
  writeFileSync(join(lib, 'A', 'y.mp3'), 'two22')
  ensureMarker(lib)
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('checkTarget', () => {
  it('accepts a new or empty folder and an existing Tab King library', () => {
    expect(checkTarget(lib, join(tmp, 'new'))).toEqual({ mode: 'empty' })
    mkdirSync(join(tmp, 'empty'))
    expect(checkTarget(lib, join(tmp, 'empty'))).toEqual({ mode: 'empty' })
    mkdirSync(join(tmp, 'other'))
    ensureMarker(join(tmp, 'other'))
    writeFileSync(join(tmp, 'other', 'song.gp'), 'x')
    expect(checkTarget(lib, join(tmp, 'other'))).toEqual({ mode: 'existing' })
  })

  it('refuses unrelated folders, the same folder, nesting and relative paths', () => {
    mkdirSync(join(tmp, 'music'))
    writeFileSync(join(tmp, 'music', 'holiday.mp3'), 'x')
    expect(checkTarget(lib, join(tmp, 'music'))).toHaveProperty(
      'error',
      expect.stringMatching(/not empty/)
    )
    expect(checkTarget(lib, lib)).toHaveProperty('error')
    expect(checkTarget(lib, join(lib, 'A'))).toHaveProperty('error')
    expect(checkTarget(join(tmp, 'lib', 'A'), tmp)).toHaveProperty('error')
    expect(checkTarget(lib, 'relative/dir')).toHaveProperty('error')
    writeFileSync(join(tmp, 'file'), 'x')
    expect(checkTarget(lib, join(tmp, 'file'))).toHaveProperty('error')
  })
})

describe('copy and remove', () => {
  it('scans files without the marker', () => {
    const scan = scanFiles(lib)
    expect(scan.files.sort()).toEqual(['A/B/x.gp', 'A/y.mp3'])
    expect(scan.bytes).toBe(8)
  })

  it('copies every file, marks the target and reports progress', async () => {
    const to = join(tmp, 'moved')
    const seen: number[] = []
    await copyLibrary(lib, to, scanFiles(lib).files, (n) => seen.push(n))
    expect(readFileSync(join(to, 'A', 'B', 'x.gp'), 'utf8')).toBe('one')
    expect(existsSync(join(to, MARKER))).toBe(true)
    expect(seen).toEqual([1, 2])
    expect(existsSync(join(lib, 'A', 'y.mp3'))).toBe(true) // the old library is untouched
  })

  it('undoes a failed copy and leaves the old library alone', async () => {
    const to = join(tmp, 'moved')
    const files = [...scanFiles(lib).files, 'missing.gp']
    await expect(copyLibrary(lib, to, files, () => {})).rejects.toThrow()
    expect(existsSync(to)).toBe(false)
    expect(scanFiles(lib).files).toHaveLength(2)
  })

  it('never overwrites an existing file in the target', async () => {
    const to = join(tmp, 'moved')
    mkdirSync(join(to, 'A'), { recursive: true })
    writeFileSync(join(to, 'A', 'y.mp3'), 'precious')
    await expect(copyLibrary(lib, to, ['A/y.mp3'], () => {})).rejects.toThrow()
    expect(readFileSync(join(to, 'A', 'y.mp3'), 'utf8')).toBe('precious')
  })

  it('removes only the copied files, the marker and emptied folders', () => {
    writeFileSync(join(lib, 'keep.txt'), 'mine')
    expect(removeCopied(lib, ['A/B/x.gp', 'A/y.mp3'])).toBe(2)
    expect(existsSync(join(lib, 'A'))).toBe(false)
    expect(existsSync(join(lib, MARKER))).toBe(false)
    expect(readFileSync(join(lib, 'keep.txt'), 'utf8')).toBe('mine')
  })

  it('removes the whole folder when nothing else is in it', () => {
    removeCopied(lib, scanFiles(lib).files)
    expect(existsSync(lib)).toBe(false)
  })
})

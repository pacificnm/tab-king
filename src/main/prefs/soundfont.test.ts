import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importSoundFont, isSoundFont } from './soundfont'

let tmp: string
beforeEach(() => void (tmp = mkdtempSync(join(tmpdir(), 'tk-sf-'))))
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const riff = (form: string): Buffer =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([4, 0, 0, 0]),
    Buffer.from(form),
    Buffer.alloc(8)
  ])

describe('soundfont import', () => {
  it('recognises SoundFont files by extension and header', () => {
    writeFileSync(join(tmp, 'a.sf2'), riff('sfbk'))
    writeFileSync(join(tmp, 'b.sf2'), riff('WAVE'))
    writeFileSync(join(tmp, 'c.txt'), riff('sfbk'))
    writeFileSync(join(tmp, 'd.sf3'), 'tiny')
    expect(isSoundFont(join(tmp, 'a.sf2'))).toBe(true)
    expect(isSoundFont(join(tmp, 'b.sf2'))).toBe(false)
    expect(isSoundFont(join(tmp, 'c.txt'))).toBe(false)
    expect(isSoundFont(join(tmp, 'd.sf3'))).toBe(false)
  })

  it('copies under a unique name and rejects other files', () => {
    const src = join(tmp, 'My Guitars.sf2')
    writeFileSync(src, riff('sfbk'))
    const dir = join(tmp, 'soundfonts')
    expect(importSoundFont(src, dir)).toBe('My Guitars.sf2')
    expect(importSoundFont(src, dir)).toBe('My Guitars (2).sf2')
    expect(readdirSync(dir)).toHaveLength(2)
    writeFileSync(join(tmp, 'x.sf2'), 'nope')
    expect(() => importSoundFont(join(tmp, 'x.sf2'), dir)).toThrow(/not a SoundFont/)
  })
})

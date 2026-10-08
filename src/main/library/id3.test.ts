import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { coverExtension, readId3 } from './id3'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

const be32 = (n: number): Buffer =>
  Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
const syncsafe = (n: number): Buffer =>
  Buffer.from([(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127])
const frame = (id: string, body: Buffer): Buffer =>
  Buffer.concat([Buffer.from(id), be32(body.length), Buffer.from([0, 0]), body])
const text = (id: string, s: string): Buffer =>
  frame(id, Buffer.concat([Buffer.from([0]), Buffer.from(s, 'latin1')]))

function makeMp3(withCover: boolean): string {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
  const frames = [
    text('TIT2', 'YYZ'),
    text('TPE1', 'Rush'),
    text('TALB', 'Moving Pictures'),
    text('TYER', '1981'),
    text('TRCK', '2/8'),
    text('TCON', 'Rock'),
    ...(withCover
      ? [
          frame(
            'APIC',
            Buffer.concat([
              Buffer.from([0]),
              Buffer.from('image/png\0'),
              Buffer.from([3]),
              Buffer.from('\0'),
              png
            ])
          )
        ]
      : [])
  ]
  const body = Buffer.concat(frames)
  const d = mkdtempSync(join(tmpdir(), 'tabking-id3-'))
  dirs.push(d)
  const file = join(d, 'a.mp3')
  writeFileSync(
    file,
    Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), syncsafe(body.length), body])
  )
  return file
}

describe('readId3', () => {
  it('reads tags and the embedded cover', async () => {
    const { info, cover } = await readId3(makeMp3(true))
    expect(info).toMatchObject({
      title: 'YYZ',
      artist: 'Rush',
      album: 'Moving Pictures',
      year: 1981,
      trackNo: 2,
      genre: 'Rock'
    })
    expect(cover?.mime).toBe('image/png')
    expect([...(cover?.data ?? [])].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('returns null cover when absent and rejects unreadable files', async () => {
    expect((await readId3(makeMp3(false))).cover).toBeNull()
    const d = mkdtempSync(join(tmpdir(), 'tabking-id3-'))
    dirs.push(d)
    await expect(readId3(join(d, 'missing.mp3'))).rejects.toThrow()
  })

  it('maps mime types to extensions', () => {
    expect([
      coverExtension('image/png'),
      coverExtension('image/jpeg'),
      coverExtension('image/webp')
    ]).toEqual(['png', 'jpg', 'webp'])
  })
})

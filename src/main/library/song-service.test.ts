import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SongForm } from '@shared/types'
import { openDatabase } from '../db/connection'
import { LibraryRepo } from '../db/repo/library-repo'
import { PickedFiles } from './picked-files'
import { SongService } from './song-service'
import { LibraryStore } from './store'

let dir: string
let repo: LibraryRepo
let store: LibraryStore
let picked: PickedFiles
let svc: SongService
const coverBytes = new Uint8Array([1, 2, 3])

const src = (name: string): { token: string } => {
  const p = join(dir, name)
  writeFileSync(p, name)
  return { token: picked.add(p).token }
}
const form = (over: Partial<SongForm> = {}): SongForm => ({
  artist: 'Rush',
  album: 'Moving Pictures',
  title: 'YYZ',
  trackNo: 2,
  genre: null,
  year: 1981,
  durationMs: null,
  gp: src('yyz.gp'),
  midi: null,
  masterMp3: null,
  masterSource: 'synth',
  synthSource: 'gp',
  syncOffsetMs: 0,
  tracks: [],
  cover: 'none',
  ...over
})
const files = (): string[] =>
  existsSync(store.root) ? readdirSync(store.root, { recursive: true }).map(String) : []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tabking-svc-'))
  repo = new LibraryRepo(openDatabase(':memory:'))
  store = new LibraryStore(join(dir, 'lib'))
  picked = new PickedFiles()
  svc = new SongService(repo, store, picked, async () => ({
    info: {
      title: null,
      artist: null,
      album: null,
      year: null,
      trackNo: null,
      genre: null,
      durationMs: null
    },
    cover: { mime: 'image/png', data: coverBytes }
  }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SongService', () => {
  it('adds a song: copies GP + MP3s + cover into the library and stores relative paths', async () => {
    const song = await svc.addSong(
      form({
        masterMp3: src('master.mp3'),
        masterSource: 'mp3',
        cover: 'id3',
        tracks: [
          {
            trackIndex: 0,
            name: 'Guitar',
            instrument: null,
            mp3: src('gtr.mp3'),
            source: 'mp3',
            volume: 1,
            muted: false,
            solo: false
          },
          {
            trackIndex: 1,
            name: 'Bass',
            instrument: null,
            mp3: null,
            source: 'mp3',
            volume: 1,
            muted: false,
            solo: false
          }
        ]
      })
    )
    expect(song.gpPath).toBe('Rush/Moving Pictures/YYZ/yyz.gp')
    expect(song.masterMp3Path).toBe('Rush/Moving Pictures/YYZ/master.mp3')
    expect(song.tracks.map((t) => [t.mp3Path, t.source])).toEqual([
      ['Rush/Moving Pictures/YYZ/track1-gtr.mp3', 'mp3'],
      [null, 'synth']
    ])
    expect(song.coverPath).toBe('Rush/Moving Pictures/cover.png')
    expect(store.exists(song.coverPath!)).toBe(true)
    expect(svc.check(song.id).every((c) => c.exists)).toBe(true)
  })

  it('rolls back copied files when validation or the DB write fails', async () => {
    await expect(svc.addSong(form({ title: ' ' }))).rejects.toThrow(/Title/)
    await expect(svc.addSong(form({ gp: { token: 'nope' } }))).rejects.toThrow(
      /pick the file again/
    )
    expect(files()).toEqual([])
    // DB failure after files are copied
    repo.createSong = () => {
      throw new Error('db boom')
    }
    await expect(svc.addSong(form({ masterMp3: src('m.mp3'), cover: 'id3' }))).rejects.toThrow(
      'db boom'
    )
    expect(files()).toEqual([])
  })

  it('edits: replaces a file, removes another, deletes orphans, keeps untouched files', async () => {
    const s = await svc.addSong(form({ masterMp3: src('master.mp3'), midi: src('a.mid') }))
    const updated = await svc.updateSong(
      s.id,
      form({
        title: 'YYZ (live)',
        gp: { token: src('new.gp').token },
        midi: null,
        masterMp3: { existing: s.masterMp3Path! }
      })
    )
    expect(updated.title).toBe('YYZ (live)')
    expect(updated.gpPath).toBe('Rush/Moving Pictures/YYZ/new.gp')
    expect(store.exists(s.gpPath)).toBe(false)
    expect(store.exists(s.midiPath!)).toBe(false)
    expect(store.exists(s.masterMp3Path!)).toBe(true)
    await expect(svc.updateSong(s.id, form({ gp: { existing: 'Other/x.gp' } }))).rejects.toThrow(
      /Unknown existing/
    )
    await expect(svc.updateSong(999, form())).rejects.toThrow(/no longer exists/)
  })

  it('keeps the cover on edit, and drops it when the album changes or is removed', async () => {
    const s = await svc.addSong(form({ masterMp3: src('m.mp3'), cover: 'id3' }))
    const keep = await svc.updateSong(
      s.id,
      form({ gp: { existing: s.gpPath }, masterMp3: { existing: s.masterMp3Path! }, cover: 'keep' })
    )
    expect(keep.coverPath).toBe(s.coverPath)
    const moved = await svc.updateSong(
      s.id,
      form({
        album: 'Other',
        gp: { existing: s.gpPath },
        masterMp3: { existing: s.masterMp3Path! },
        cover: 'keep'
      })
    )
    expect(moved.coverPath).toBeNull()
    expect(store.exists(s.coverPath!)).toBe(false) // old album pruned along with its cover
  })

  it('deletes with or without removing files, and keeps files when asked, removes them otherwise', async () => {
    const a = await svc.addSong(form({ masterMp3: src('m.mp3'), cover: 'id3' }))
    const b = await svc.addSong(form({ title: 'Other', gp: src('o.gp') }))
    svc.deleteSong(a.id, false)
    expect(store.exists(a.gpPath)).toBe(true)
    expect(repo.getSong(a.id)).toBeUndefined()
    svc.deleteSong(b.id, true)
    expect(store.exists(b.gpPath)).toBe(false)
    expect(store.exists('Rush/Moving Pictures/cover.png')).toBe(false) // b was the album's last song
  })

  it('removes cover and empty folders when the last song is deleted with files', async () => {
    const a = await svc.addSong(form({ masterMp3: src('m.mp3'), cover: 'id3' }))
    svc.deleteSong(a.id, true)
    expect(files()).toEqual([])
  })

  it('reports missing files without throwing', async () => {
    const s = await svc.addSong(form({ masterMp3: src('m.mp3') }))
    store.remove(s.masterMp3Path!)
    const missing = svc.check(s.id).filter((c) => !c.exists)
    expect(missing).toEqual([{ path: s.masterMp3Path, label: 'Master MP3', exists: false }])
    expect(svc.check(12345)).toEqual([])
  })
})

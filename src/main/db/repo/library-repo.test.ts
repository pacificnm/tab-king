import { beforeEach, describe, expect, it } from 'vitest'
import type { SongInput } from '@shared/types'
import { openDatabase } from '../connection'
import { LibraryRepo } from './library-repo'

const base: SongInput = {
  artist: 'Rush',
  album: 'Moving Pictures',
  title: 'YYZ',
  gpPath: 'Rush/MP/YYZ/yyz.gp'
}
let repo: LibraryRepo
beforeEach(() => {
  repo = new LibraryRepo(openDatabase(':memory:'))
})

describe('LibraryRepo', () => {
  it('creates a song with artist, album, cover and tracks, reusing parents case-insensitively', () => {
    const a = repo.createSong({
      ...base,
      coverPath: 'Rush/MP/cover.jpg',
      masterMp3Path: 'Rush/MP/YYZ/m.mp3',
      tracks: [
        {
          trackIndex: 0,
          name: 'Guitar',
          instrument: 'guitar',
          mp3Path: 'g.mp3',
          source: 'mp3',
          volume: 0.5,
          muted: false,
          solo: false
        }
      ]
    })
    const b = repo.createSong({
      ...base,
      artist: 'RUSH',
      title: 'Tom Sawyer',
      gpPath: 'ts.gp',
      trackNo: 1
    })
    expect(b.artistId).toBe(a.artistId)
    expect(b.albumId).toBe(a.albumId)
    expect(a.coverPath).toBe('Rush/MP/cover.jpg')
    expect(a.tracks[0]).toMatchObject({ source: 'mp3', volume: 0.5, muted: false, solo: false })
    expect(repo.listArtists()).toEqual([
      { id: a.artistId, name: 'Rush', albumCount: 1, songCount: 2 }
    ])
    expect(repo.listAlbums(a.artistId)[0]).toMatchObject({ title: 'Moving Pictures', songCount: 2 })
    expect(repo.listSongs(a.artistId, a.albumId).map((s) => s.title)).toEqual(['Tom Sawyer', 'YYZ'])
  })

  it('lists album-less songs under the artist', () => {
    const s = repo.createSong({ ...base, album: null })
    expect(repo.listSongs(s.artistId, null)).toHaveLength(1)
    expect(repo.listAlbums(s.artistId)).toEqual([])
  })

  it('updates a song, moves it between albums, prunes empties and reports orphaned files', () => {
    const s = repo.createSong({ ...base, midiPath: 'old.mid' })
    const { song, orphanedFiles } = repo.updateSong(s.id, {
      ...base,
      artist: 'Yes',
      album: 'Fragile',
      gpPath: 'new.gp'
    })
    expect(song.artistName).toBe('Yes')
    expect(orphanedFiles.sort()).toEqual(['Rush/MP/YYZ/yyz.gp', 'old.mid'].sort())
    expect(repo.listArtists().map((a) => a.name)).toEqual(['Yes'])
    expect(() => repo.updateSong(999, base)).toThrow(/not found/)
  })

  it('deletes a song, returns its files, prunes empties and cascades children', () => {
    const s = repo.createSong({
      ...base,
      masterMp3Path: 'm.mp3',
      tracks: [
        {
          trackIndex: 0,
          name: 'G',
          instrument: null,
          mp3Path: 'g.mp3',
          source: 'synth',
          volume: 1,
          muted: false,
          solo: false
        }
      ]
    })
    expect(repo.deleteSong(s.id).sort()).toEqual(['Rush/MP/YYZ/yyz.gp', 'g.mp3', 'm.mp3'].sort())
    expect(repo.listArtists()).toEqual([])
    expect(repo.getSong(s.id)).toBeUndefined()
    expect(repo.deleteSong(s.id)).toEqual([])
  })

  it('renames an artist, merging into an existing one', () => {
    const a = repo.createSong(base)
    const b = repo.createSong({ ...base, artist: 'Rush Band', title: 'Other', gpPath: 'o.gp' })
    repo.renameArtist(b.artistId, 'rush')
    const artists = repo.listArtists()
    expect(artists).toHaveLength(1)
    expect(artists[0]).toMatchObject({ id: a.artistId, songCount: 2, albumCount: 1 })
    repo.renameArtist(a.artistId, 'Rush!')
    expect(repo.listArtists()[0]?.name).toBe('Rush!')
  })

  it('persists the track mix and synth source without touching other fields', () => {
    const s = repo.createSong({
      ...base,
      midiPath: 'a.mid',
      tracks: [
        {
          trackIndex: 0,
          name: 'Lead',
          instrument: 'Guitar',
          mp3Path: null,
          source: 'synth',
          volume: 1,
          muted: false,
          solo: false
        },
        {
          trackIndex: 1,
          name: 'Bass',
          instrument: 'Bass',
          mp3Path: null,
          source: 'synth',
          volume: 1,
          muted: false,
          solo: false
        }
      ]
    })
    expect(s.synthSource).toBe('gp')
    repo.saveMix(s.id, {
      synthSource: 'midi',
      masterSource: 'mp3',
      tracks: [
        { trackIndex: 0, source: 'mp3', volume: 0.4, muted: true, solo: false },
        { trackIndex: 1, source: 'synth', volume: 1.25, muted: false, solo: true },
        { trackIndex: 9, source: 'synth', volume: 1, muted: false, solo: false } // unknown track: ignored
      ]
    })
    const after = repo.getSong(s.id)!
    expect(after.synthSource).toBe('midi')
    expect(after.masterSource).toBe('mp3')
    expect(after.tracks.map((t) => t.source)).toEqual(['mp3', 'synth'])
    expect(after.tracks.map((t) => [t.volume, t.muted, t.solo])).toEqual([
      [0.4, true, false],
      [1.25, false, true]
    ])
    expect(after.title).toBe(s.title)
    expect(after.tracks).toHaveLength(2)
  })

  it('saves the start offset and replaces sync points as a unit', () => {
    const s = repo.createSong(base)
    expect(s.syncPoints).toEqual([])
    repo.saveSync(s.id, {
      offsetMs: -1500,
      points: [
        { measure: 9, mp3Ms: 20000 },
        { measure: 3, mp3Ms: 5000 }
      ]
    })
    let after = repo.getSong(s.id)!
    expect(after.syncOffsetMs).toBe(-1500)
    expect(after.syncPoints).toEqual([
      { measure: 3, mp3Ms: 5000 },
      { measure: 9, mp3Ms: 20000 }
    ])
    repo.saveSync(s.id, { offsetMs: 0, points: [{ measure: 4, mp3Ms: 7000 }] })
    after = repo.getSong(s.id)!
    expect(after.syncPoints).toEqual([{ measure: 4, mp3Ms: 7000 }])
    // a duplicate measure violates the table's uniqueness and rolls the whole save back
    expect(() =>
      repo.saveSync(s.id, {
        offsetMs: 999,
        points: [
          { measure: 2, mp3Ms: 1 },
          { measure: 2, mp3Ms: 2 }
        ]
      })
    ).toThrow(/UNIQUE/)
    after = repo.getSong(s.id)!
    expect(after.syncOffsetMs).toBe(0)
    expect(after.syncPoints).toEqual([{ measure: 4, mp3Ms: 7000 }])
  })

  it('deleting a song removes its sync points', () => {
    const s = repo.createSong(base)
    repo.saveSync(s.id, { offsetMs: 0, points: [{ measure: 2, mp3Ms: 100 }] })
    repo.deleteSong(s.id)
    expect(repo['db'].prepare('SELECT COUNT(*) c FROM sync_point').get()).toEqual({ c: 0 })
  })

  it('hydrates tracks and sync points correctly for large lists (batched across chunks)', () => {
    const ids: number[] = []
    for (let i = 0; i < 1200; i++) {
      const song = repo.createSong({
        ...base,
        title: `Song ${i}`,
        gpPath: `x/${i}.gp`,
        tracks: Array.from({ length: (i % 3) + 1 }, (_, t) => ({
          trackIndex: t,
          name: `T${i}-${t}`,
          instrument: null,
          mp3Path: null,
          source: 'synth' as const,
          volume: 1,
          muted: false,
          solo: false
        }))
      })
      ids.push(song.id)
      if (i % 100 === 0)
        repo.saveSync(song.id, {
          offsetMs: i,
          points: [
            { measure: 2, mp3Ms: i + 5 },
            { measure: 9, mp3Ms: i + 50 }
          ]
        })
    }
    // reversed, so ordering by request (not by id) is checked too
    const wanted = [...ids].reverse()
    const songs = repo.getSongs(wanted)
    expect(songs.map((s) => s.id)).toEqual(wanted)
    songs.forEach((s) => {
      const i = Number(s.title.slice(5))
      expect(
        s.tracks.map((t) => t.name),
        s.title
      ).toEqual(Array.from({ length: (i % 3) + 1 }, (_, t) => `T${i}-${t}`))
      expect(s.syncPoints, s.title).toEqual(
        i % 100 === 0
          ? [
              { measure: 2, mp3Ms: i + 5 },
              { measure: 9, mp3Ms: i + 50 }
            ]
          : []
      )
    })
    expect(repo.getSong(ids[0]!)).toEqual(songs[songs.length - 1])
  })

  it('stores settings as JSON', () => {
    expect(repo.getSetting('x')).toBeUndefined()
    repo.setSetting('x', { a: 1 })
    repo.setSetting('x', { a: 2 })
    expect(repo.getSetting('x')).toEqual({ a: 2 })
  })
})

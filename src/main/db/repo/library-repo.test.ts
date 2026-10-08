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
          volume: 0.5
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
    expect(a.tracks[0]).toMatchObject({ source: 'mp3', volume: 0.5 })
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
        { trackIndex: 0, name: 'G', instrument: null, mp3Path: 'g.mp3', source: 'synth', volume: 1 }
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

  it('stores settings as JSON', () => {
    expect(repo.getSetting('x')).toBeUndefined()
    repo.setSetting('x', { a: 1 })
    repo.setSetting('x', { a: 2 })
    expect(repo.getSetting('x')).toEqual({ a: 2 })
  })
})

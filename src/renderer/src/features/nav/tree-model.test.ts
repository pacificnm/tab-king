import { describe, expect, it } from 'vitest'
import type { AlbumRow, ArtistRow, Song } from '@shared/types'
import { buildRows, emptyData, songsKey, type Expanded, type TreeData } from './tree-model'

const artist = (id: number, name: string): ArtistRow => ({ id, name, albumCount: 1, songCount: 1 })
const album = (id: number, artistId: number, title: string): AlbumRow => ({
  id,
  artistId,
  title,
  year: null,
  coverPath: null,
  songCount: 1
})
const song = (id: number, title: string): Song => ({ id, title }) as Song
const none: Expanded = {
  artists: false,
  playlists: false,
  artistIds: new Set(),
  songGroups: new Set()
}
const labels = (d: TreeData, e: Expanded): string[] =>
  buildRows(d, e).map((r) => {
    switch (r.kind) {
      case 'artist':
        return r.artist.name
      case 'album':
        return r.album.title
      case 'song':
        return r.song.title
      case 'nav':
        return r.label
      case 'playlist':
        return r.playlist.name
      case 'status':
        return r.text
    }
  })

describe('buildRows — play lists', () => {
  const lists = [
    { id: 1, name: 'Warmups', songCount: 3 },
    { id: 2, name: 'Gig', songCount: 0 }
  ]
  it('shows play lists under Play Lists when expanded', () => {
    const data: TreeData = { ...emptyData(), playlists: lists }
    expect(labels(data, none)).toEqual(['Search', 'Play Lists', 'Favorites', 'Artists'])
    expect(labels(data, { ...none, playlists: true })).toEqual([
      'Search',
      'Play Lists',
      'Warmups',
      'Gig',
      'Favorites',
      'Artists'
    ])
    expect(labels({ ...emptyData(), playlists: [] }, { ...none, playlists: true })[2]).toBe(
      'No play lists yet'
    )
    expect(labels(emptyData(), { ...none, playlists: true })[2]).toBe('Loading…')
  })

  it('lets both branches be open at once with unique keys', () => {
    const data: TreeData = { ...emptyData(), playlists: lists, artists: [] }
    const rows = buildRows(data, { ...none, playlists: true, artists: true })
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
    expect(rows.find((r) => r.kind === 'playlist')).toMatchObject({ level: 2 })
  })
})

describe('buildRows', () => {
  it('lists Search, Play Lists, Favorites, Artists in order', () => {
    expect(labels(emptyData(), none)).toEqual(['Search', 'Play Lists', 'Favorites', 'Artists'])
  })

  it('shows loading and empty states under Artists', () => {
    const open = { ...none, artists: true }
    expect(labels(emptyData(), open).at(-1)).toBe('Loading…')
    expect(labels({ ...emptyData(), artists: [] }, open).at(-1)).toBe('No songs yet')
  })

  it('nests Artist → Album → Song and puts album-less songs under the artist', () => {
    const data: TreeData = {
      playlists: null,
      artists: [artist(1, 'Rush'), artist(2, 'Yes')],
      albums: { 1: [album(10, 1, 'Signals')] },
      songs: {
        [songsKey(1, 10)]: [song(100, 'Subdivisions')],
        [songsKey(1, null)]: [song(101, 'Loose')]
      }
    }
    const exp: Expanded = {
      artists: true,
      playlists: false,
      artistIds: new Set([1]),
      songGroups: new Set([songsKey(1, 10), songsKey(1, null)])
    }
    const rows = buildRows(data, exp)
    expect(rows.slice(4).map((r) => [r.kind, r.level])).toEqual([
      ['artist', 2],
      ['album', 3],
      ['song', 4],
      ['song', 3],
      ['artist', 2]
    ])
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })

  it('shows loading rows for unfetched children and hides collapsed ones', () => {
    const data: TreeData = { artists: [artist(1, 'Rush')], playlists: null, albums: {}, songs: {} }
    expect(
      labels(data, {
        artists: true,
        playlists: false,
        artistIds: new Set([1]),
        songGroups: new Set()
      }).slice(4)
    ).toEqual(['Rush', 'Loading…'])
    const withAlbum = { ...data, albums: { 1: [album(10, 1, 'Signals')] } }
    expect(
      labels(withAlbum, {
        artists: true,
        playlists: false,
        artistIds: new Set([1]),
        songGroups: new Set()
      }).slice(4)
    ).toEqual(['Rush', 'Signals'])
    expect(
      labels(withAlbum, {
        artists: true,
        playlists: false,
        artistIds: new Set([1]),
        songGroups: new Set([songsKey(1, 10)])
      }).slice(-1)
    ).toEqual(['Loading…'])
  })
})

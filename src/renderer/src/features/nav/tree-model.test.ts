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
const none: Expanded = { artists: false, artistIds: new Set(), songGroups: new Set() }
const labels = (d: TreeData, e: Expanded): string[] =>
  buildRows(d, e).map((r) =>
    r.kind === 'artist'
      ? r.artist.name
      : r.kind === 'album'
        ? r.album.title
        : r.kind === 'song'
          ? r.song.title
          : r.kind === 'nav'
            ? r.label
            : r.text
  )

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
      artists: [artist(1, 'Rush'), artist(2, 'Yes')],
      albums: { 1: [album(10, 1, 'Signals')] },
      songs: {
        [songsKey(1, 10)]: [song(100, 'Subdivisions')],
        [songsKey(1, null)]: [song(101, 'Loose')]
      }
    }
    const exp: Expanded = {
      artists: true,
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
    const data: TreeData = { artists: [artist(1, 'Rush')], albums: {}, songs: {} }
    expect(
      labels(data, { artists: true, artistIds: new Set([1]), songGroups: new Set() }).slice(4)
    ).toEqual(['Rush', 'Loading…'])
    const withAlbum = { ...data, albums: { 1: [album(10, 1, 'Signals')] } }
    expect(
      labels(withAlbum, { artists: true, artistIds: new Set([1]), songGroups: new Set() }).slice(4)
    ).toEqual(['Rush', 'Signals'])
    expect(
      labels(withAlbum, {
        artists: true,
        artistIds: new Set([1]),
        songGroups: new Set([songsKey(1, 10)])
      }).slice(-1)
    ).toEqual(['Loading…'])
  })
})

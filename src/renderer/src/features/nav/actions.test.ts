import { describe, expect, it } from 'vitest'
import type { AlbumRow, ArtistRow, PlaylistRow, Song } from '@shared/types'
import { menuFor } from './actions'

const artist = { id: 1, name: 'Rush' } as ArtistRow
const album = { id: 2, title: 'Signals' } as AlbumRow
const song = { id: 3, artistName: 'Rush', albumTitle: 'Signals', favorite: false } as Song
const playlist = { id: 4, name: 'Warmups', songCount: 2 } as PlaylistRow

describe('menuFor', () => {
  it('offers Add, Edit, Play on artists, albums, songs and play lists', () => {
    for (const t of [
      { kind: 'artist', artist },
      { kind: 'album', artist, album },
      { kind: 'song', song },
      { kind: 'playlist', playlist }
    ] as const) {
      const labels = menuFor(t).map((m) => m.label)
      expect(
        labels.some((l) => l.startsWith('Add')),
        t.kind
      ).toBe(true)
      expect(
        labels.some((l) => l.startsWith('Edit') || l.startsWith('Rename')),
        t.kind
      ).toBe(true)
      expect(
        labels.some((l) => l.startsWith('Play')),
        t.kind
      ).toBe(true)
    }
  })

  it('presets the Add dialog from the clicked item', () => {
    expect(menuFor({ kind: 'artist', artist })[0]?.action).toEqual({
      type: 'add',
      preset: { artist: 'Rush' }
    })
    expect(menuFor({ kind: 'album', artist, album })[0]?.action).toEqual({
      type: 'add',
      preset: { artist: 'Rush', album: 'Signals' }
    })
    expect(menuFor({ kind: 'artists-root' })[0]?.action).toEqual({ type: 'add' })
    expect(menuFor({ kind: 'playlists-root' })[0]?.action).toEqual({ type: 'new-playlist' })
  })

  it('songs can be favorited, added to a play list and deleted; every entry is enabled', () => {
    const items = menuFor({ kind: 'song', song })
    expect(items.map((m) => m.action?.type)).toEqual([
      'add',
      'edit-song',
      'play',
      'add-to-playlist',
      'toggle-favorite',
      'delete-song'
    ])
    expect(items.some((m) => m.disabled)).toBe(false)
  })

  it('words the favorite entry by the current state', () => {
    const label = (favorite: boolean): string | undefined =>
      menuFor({ kind: 'song', song: { ...song, favorite } }).find(
        (m) => m.action?.type === 'toggle-favorite'
      )?.label
    expect(label(false)).toBe('Add to favorites')
    expect(label(true)).toBe('Remove from favorites')
  })

  it('play lists can be renamed and deleted, and an empty one cannot be played', () => {
    const items = menuFor({ kind: 'playlist', playlist })
    expect(items.map((m) => m.action?.type)).toEqual([
      'add-songs-to-playlist',
      'rename-playlist',
      'play',
      'delete-playlist'
    ])
    const empty = menuFor({ kind: 'playlist', playlist: { ...playlist, songCount: 0 } })
    expect(empty.find((m) => m.action?.type === 'play')?.disabled).toBe(true)
    expect(menuFor({ kind: 'artist', artist }).some((m) => m.action?.type === 'delete-song')).toBe(
      false
    )
  })
})

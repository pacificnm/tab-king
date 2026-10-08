import { describe, expect, it } from 'vitest'
import type { AlbumRow, ArtistRow, Song } from '@shared/types'
import { menuFor } from './actions'

const artist = { id: 1, name: 'Rush' } as ArtistRow
const album = { id: 2, title: 'Signals' } as AlbumRow
const song = { id: 3, artistName: 'Rush', albumTitle: 'Signals' } as Song

describe('menuFor', () => {
  it('offers Add, Edit, Play on artists, albums and songs', () => {
    for (const t of [
      { kind: 'artist', artist },
      { kind: 'album', artist, album },
      { kind: 'song', song }
    ] as const) {
      const labels = menuFor(t).map((m) => m.label)
      expect(labels.some((l) => l.startsWith('Add'))).toBe(true)
      expect(labels.some((l) => l.startsWith('Edit'))).toBe(true)
      expect(labels.some((l) => l.startsWith('Play'))).toBe(true)
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
  })

  it('only songs can be deleted, and playlist/favorite are disabled until M5', () => {
    const songMenu = menuFor({ kind: 'song', song })
    expect(songMenu.filter((m) => m.action?.type === 'delete-song')).toHaveLength(1)
    expect(songMenu.filter((m) => m.disabled).map((m) => m.label)).toEqual([
      'Add to playlist',
      'Favorite'
    ])
    expect(menuFor({ kind: 'artist', artist }).some((m) => m.action?.type === 'delete-song')).toBe(
      false
    )
  })
})

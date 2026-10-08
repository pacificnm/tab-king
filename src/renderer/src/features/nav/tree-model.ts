import type { AlbumRow, ArtistRow, Song } from '@shared/types'

export type NavId = 'search' | 'playlists' | 'favorites' | 'artists'

/** NAV-1: fixed order. */
export const NAV_ITEMS: { id: NavId; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'playlists', label: 'Play Lists' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'artists', label: 'Artists' }
]

export interface TreeData {
  artists: ArtistRow[] | null
  albums: Record<number, AlbumRow[]>
  /** Keyed by {@link songsKey}. */
  songs: Record<string, Song[]>
}

export interface Expanded {
  artists: boolean
  artistIds: ReadonlySet<number>
  /** Keys from {@link songsKey}. */
  songGroups: ReadonlySet<string>
}

export type TreeRow =
  | {
      key: string
      kind: 'nav'
      level: 1
      id: NavId
      label: string
      expandable: boolean
      expanded: boolean
    }
  | { key: string; kind: 'artist'; level: 2; artist: ArtistRow; expanded: boolean }
  | { key: string; kind: 'album'; level: 3; artist: ArtistRow; album: AlbumRow; expanded: boolean }
  | { key: string; kind: 'song'; level: 3 | 4; song: Song }
  | { key: string; kind: 'status'; level: 2 | 3 | 4; text: string }

/** Songs of an album, or an artist's album-less songs when `albumId` is null. */
export const songsKey = (artistId: number, albumId: number | null): string =>
  `${artistId}:${albumId ?? 'none'}`

export function emptyData(): TreeData {
  return { artists: null, albums: {}, songs: {} }
}

/** Flatten the loaded/expanded tree into the rows the virtualized list renders. */
export function buildRows(data: TreeData, exp: Expanded): TreeRow[] {
  const rows: TreeRow[] = NAV_ITEMS.map((n) => ({
    key: `nav:${n.id}`,
    kind: 'nav',
    level: 1,
    id: n.id,
    label: n.label,
    expandable: n.id === 'artists',
    expanded: n.id === 'artists' && exp.artists
  }))
  if (!exp.artists) return rows

  if (!data.artists) {
    rows.push({ key: 'status:artists', kind: 'status', level: 2, text: 'Loading…' })
    return rows
  }
  if (data.artists.length === 0) {
    rows.push({ key: 'status:artists', kind: 'status', level: 2, text: 'No songs yet' })
    return rows
  }

  for (const artist of data.artists) {
    const open = exp.artistIds.has(artist.id)
    rows.push({ key: `artist:${artist.id}`, kind: 'artist', level: 2, artist, expanded: open })
    if (!open) continue
    const albums = data.albums[artist.id]
    if (!albums) {
      rows.push({ key: `status:a${artist.id}`, kind: 'status', level: 3, text: 'Loading…' })
      continue
    }
    for (const album of albums) {
      const albumOpen = exp.songGroups.has(songsKey(artist.id, album.id))
      rows.push({
        key: `album:${album.id}`,
        kind: 'album',
        level: 3,
        artist,
        album,
        expanded: albumOpen
      })
      if (!albumOpen) continue
      const songs = data.songs[songsKey(artist.id, album.id)]
      if (!songs)
        rows.push({ key: `status:al${album.id}`, kind: 'status', level: 4, text: 'Loading…' })
      else
        for (const song of songs)
          rows.push({ key: `song:${song.id}`, kind: 'song', level: 4, song })
    }
    for (const song of data.songs[songsKey(artist.id, null)] ?? []) {
      rows.push({ key: `song:${song.id}`, kind: 'song', level: 3, song })
    }
  }
  return rows
}

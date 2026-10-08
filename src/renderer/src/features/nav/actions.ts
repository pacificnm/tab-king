import type { AlbumRow, ArtistRow, PlaylistRow, Song } from '@shared/types'

export type MenuTarget =
  | { kind: 'artists-root' }
  | { kind: 'playlists-root' }
  | { kind: 'artist'; artist: ArtistRow }
  | { kind: 'album'; artist: ArtistRow; album: AlbumRow }
  | { kind: 'song'; song: Song }
  | { kind: 'playlist'; playlist: PlaylistRow }

export type LibraryAction =
  | { type: 'add'; preset?: { artist?: string; album?: string } }
  | { type: 'edit-artist'; artist: ArtistRow }
  | { type: 'edit-album'; album: AlbumRow }
  | { type: 'edit-song'; song: Song }
  | { type: 'play'; target: MenuTarget }
  | { type: 'delete-song'; song: Song }
  | { type: 'toggle-favorite'; song: Song }
  | { type: 'add-to-playlist'; song: Song }
  | { type: 'new-playlist' }
  | { type: 'rename-playlist'; playlist: PlaylistRow }
  | { type: 'delete-playlist'; playlist: PlaylistRow }
  | { type: 'add-songs-to-playlist'; playlist: PlaylistRow }

export interface MenuSpec {
  label: string
  action?: LibraryAction
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

/** NAV-3 / SPECS §4: every item offers Add, Edit, Play (Delete where it makes sense). */
export function menuFor(target: MenuTarget): MenuSpec[] {
  switch (target.kind) {
    case 'artists-root':
      return [{ label: 'Add song…', action: { type: 'add' } }]
    case 'playlists-root':
      return [{ label: 'New play list…', action: { type: 'new-playlist' } }]
    case 'artist':
      return [
        { label: 'Add song…', action: { type: 'add', preset: { artist: target.artist.name } } },
        { label: 'Edit artist…', action: { type: 'edit-artist', artist: target.artist } },
        { label: 'Play all', action: { type: 'play', target } }
      ]
    case 'album':
      return [
        {
          label: 'Add song…',
          action: { type: 'add', preset: { artist: target.artist.name, album: target.album.title } }
        },
        { label: 'Edit album…', action: { type: 'edit-album', album: target.album } },
        { label: 'Play', action: { type: 'play', target } }
      ]
    case 'song': {
      const s = target.song
      return [
        {
          label: 'Add song…',
          action: {
            type: 'add',
            preset: { artist: s.artistName, album: s.albumTitle ?? undefined }
          }
        },
        { label: 'Edit…', action: { type: 'edit-song', song: s } },
        { label: 'Play', action: { type: 'play', target } },
        {
          label: 'Add to play list…',
          action: { type: 'add-to-playlist', song: s },
          separator: true
        },
        {
          label: s.favorite ? 'Remove from favorites' : 'Add to favorites',
          action: { type: 'toggle-favorite', song: s }
        },
        {
          label: 'Delete…',
          action: { type: 'delete-song', song: s },
          danger: true,
          separator: true
        }
      ]
    }
    case 'playlist':
      return [
        {
          label: 'Add songs…',
          action: { type: 'add-songs-to-playlist', playlist: target.playlist }
        },
        { label: 'Rename…', action: { type: 'rename-playlist', playlist: target.playlist } },
        {
          label: 'Play',
          action: { type: 'play', target },
          disabled: target.playlist.songCount === 0
        },
        {
          label: 'Delete…',
          action: { type: 'delete-playlist', playlist: target.playlist },
          danger: true,
          separator: true
        }
      ]
  }
}

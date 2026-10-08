import type { AlbumRow, ArtistRow, Song } from '@shared/types'

export type MenuTarget =
  | { kind: 'artists-root' }
  | { kind: 'artist'; artist: ArtistRow }
  | { kind: 'album'; artist: ArtistRow; album: AlbumRow }
  | { kind: 'song'; song: Song }

export type LibraryAction =
  | { type: 'add'; preset?: { artist?: string; album?: string } }
  | { type: 'edit-artist'; artist: ArtistRow }
  | { type: 'edit-album'; album: AlbumRow }
  | { type: 'edit-song'; song: Song }
  | { type: 'play'; target: MenuTarget }
  | { type: 'delete-song'; song: Song }

export interface MenuSpec {
  label: string
  action?: LibraryAction
  disabled?: boolean
  danger?: boolean
  separator?: boolean
}

/** NAV-3 / SPECS §4: every item offers Add, Edit, Play (Delete for songs). */
export function menuFor(target: MenuTarget): MenuSpec[] {
  switch (target.kind) {
    case 'artists-root':
      return [{ label: 'Add song…', action: { type: 'add' } }]
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
        { label: 'Add to playlist', disabled: true, separator: true }, // M5
        { label: 'Favorite', disabled: true }, // M5
        {
          label: 'Delete…',
          action: { type: 'delete-song', song: s },
          danger: true,
          separator: true
        }
      ]
    }
  }
}

import { createContext, useContext } from 'react'
import type { PlaylistRow, Song } from '@shared/types'
import type { MenuTarget } from '../nav/actions'

/** What list rows and views can ask the app to do; provided once by `App`. */
export interface LibraryActions {
  /** Show a song's page. */
  openSong(song: Song): void
  /** Play `songs[index]` and queue the rest (PLY-8). `label` says where the queue came from. */
  playQueue(songs: readonly Song[], index: number, label: string): void
  openAlbum(album: { id: number; artistId: number; title: string }): void
  openArtist(artist: { id: number; name: string }): void
  openPlaylist(playlist: PlaylistRow): void
  toggleFavorite(song: Song): void
  showMenu(target: MenuTarget, x: number, y: number): void
}

const Context = createContext<LibraryActions | null>(null)
export const LibraryActionsProvider = Context.Provider

export function useLibraryActions(): LibraryActions {
  const actions = useContext(Context)
  if (!actions) throw new Error('useLibraryActions must be used inside LibraryActionsProvider')
  return actions
}

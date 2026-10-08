import { btnPrimary } from '../../components/Modal'
import { useLibraryData } from '../../hooks/useLibraryData'
import { useLibraryActions } from './LibraryContext'
import { SongList } from './SongList'
import { ViewHeader } from './ViewHeader'

/** Songs marked with a heart, most recent first (NAV-5). */
export function FavoritesView(): React.JSX.Element {
  const actions = useLibraryActions()
  const songs = useLibraryData(() => window.api.library.listFavorites())
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ViewHeader
        title="Favorites"
        subtitle={songs ? `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}` : undefined}
      >
        <button
          type="button"
          className={btnPrimary}
          disabled={!songs || songs.length === 0}
          onClick={() => songs && actions.playQueue(songs, 0, 'Favorites')}
        >
          Play all
        </button>
      </ViewHeader>
      <div className="min-h-0 flex-1">
        {songs === null ? (
          <p className="p-6 text-fg-muted">Loading…</p>
        ) : songs.length === 0 ? (
          <p className="p-6 text-fg-muted">
            No favorites yet. Click the heart on a song to add it here.
          </p>
        ) : (
          <SongList songs={songs} label="Favorites" />
        )}
      </div>
    </div>
  )
}

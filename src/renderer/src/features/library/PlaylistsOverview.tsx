import { btnPrimary } from '../../components/Modal'
import { useLibraryData } from '../../hooks/useLibraryData'
import { useLibraryActions } from './LibraryContext'
import { ViewHeader } from './ViewHeader'

/** All play lists, with a way to make a new one (NAV-6). */
export function PlaylistsOverview({ onNew }: { onNew: () => void }): React.JSX.Element {
  const actions = useLibraryActions()
  const lists = useLibraryData(() => window.api.library.playlists.list())
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ViewHeader
        title="Play Lists"
        subtitle={
          lists ? `${lists.length} ${lists.length === 1 ? 'play list' : 'play lists'}` : undefined
        }
      >
        <button type="button" className={btnPrimary} onClick={onNew}>
          New play list…
        </button>
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {lists === null ? (
          <p className="p-6 text-fg-muted">Loading…</p>
        ) : lists.length === 0 ? (
          <p className="p-6 text-fg-muted">
            No play lists yet. Create one, then add songs from their menu.
          </p>
        ) : (
          <ul aria-label="Play lists">
            {lists.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-border px-6 py-3 text-left hover:bg-surface-2"
                  onClick={() => actions.openPlaylist(p)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    actions.showMenu({ kind: 'playlist', playlist: p }, e.clientX, e.clientY)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-fg-muted">
                    {p.songCount} {p.songCount === 1 ? 'song' : 'songs'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

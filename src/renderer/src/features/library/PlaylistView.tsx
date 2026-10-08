import { useState } from 'react'
import type { Song } from '@shared/types'
import { btn, btnPrimary } from '../../components/Modal'
import { useLibraryData } from '../../hooks/useLibraryData'
import type { LibraryAction } from '../nav/actions'
import { useLibraryActions } from './LibraryContext'
import { SongRow } from './SongRow'
import { ViewHeader } from './ViewHeader'

/** Move one element; returns a new array (unchanged if either index is out of range). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

interface Props {
  playlistId: number
  onAction: (action: LibraryAction) => void
  onError: (message: string) => void
}

/** One play list: play it, add/remove songs, and reorder by dragging or with the move buttons (NAV-6). */
export function PlaylistView({ playlistId, onAction, onError }: Props): React.JSX.Element {
  const actions = useLibraryActions()
  const playlist = useLibraryData(
    async () =>
      (await window.api.library.playlists.list()).find((p) => p.id === playlistId) ?? null,
    playlistId
  )
  const songs = useLibraryData(() => window.api.library.playlists.songs(playlistId), playlistId)
  // Show a reorder immediately; it is dropped as soon as the reloaded list replaces `songs`.
  const [pending, setPending] = useState<{ base: Song[]; list: Song[] } | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const shown = songs && pending && pending.base === songs ? pending.list : songs
  const label = playlist ? `Play list: ${playlist.name}` : 'Play list'

  const reorder = async (from: number, to: number): Promise<void> => {
    if (!songs || !shown) return
    const list = moveItem(shown, from, to)
    if (list.every((s, i) => s === shown[i])) return
    setPending({ base: songs, list })
    const res = await window.api.library.playlists.reorder(
      playlistId,
      list.map((s) => s.id)
    )
    if (!res.ok) {
      setPending(null)
      onError(res.error)
    }
  }

  const remove = async (song: Song): Promise<void> => {
    const res = await window.api.library.playlists.remove(playlistId, song.id)
    if (!res.ok) onError(res.error)
  }

  if (playlist === null && songs !== null) {
    return <p className="p-6 text-fg-muted">This play list no longer exists.</p>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ViewHeader
        title={playlist?.name ?? 'Play list'}
        subtitle={shown ? `${shown.length} ${shown.length === 1 ? 'song' : 'songs'}` : undefined}
      >
        <button
          type="button"
          className={btnPrimary}
          disabled={!shown || shown.length === 0}
          onClick={() => shown && actions.playQueue(shown, 0, label)}
        >
          Play
        </button>
        {playlist && (
          <>
            <button
              type="button"
              className={btn}
              onClick={() => onAction({ type: 'add-songs-to-playlist', playlist })}
            >
              Add songs…
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => onAction({ type: 'rename-playlist', playlist })}
            >
              Rename…
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => onAction({ type: 'delete-playlist', playlist })}
            >
              Delete…
            </button>
          </>
        )}
      </ViewHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown === null ? (
          <p className="p-6 text-fg-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-fg-muted">
            This play list is empty. Use “Add songs…” or a song&rsquo;s menu.
          </p>
        ) : (
          <div role="list" aria-label={playlist?.name ?? 'Play list'}>
            {shown.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                queue={shown}
                queueLabel={label}
                style={{ height: 56 }}
                draggable
                dragProps={{
                  className:
                    dragOver === i && dragFrom !== null && dragFrom !== i
                      ? 'border-t-2 !border-t-accent'
                      : '',
                  onDragStart: (e) => {
                    setDragFrom(i)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(song.id))
                  },
                  onDragOver: (e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dragOver !== i) setDragOver(i)
                  },
                  onDrop: (e) => {
                    e.preventDefault()
                    const from = dragFrom
                    setDragFrom(null)
                    setDragOver(null)
                    if (from !== null) void reorder(from, i)
                  },
                  onDragEnd: () => {
                    setDragFrom(null)
                    setDragOver(null)
                  }
                }}
              >
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`${btn} !px-2 !py-0.5`}
                    aria-label={`Move ${song.title} up`}
                    disabled={i === 0}
                    onClick={() => void reorder(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={`${btn} !px-2 !py-0.5`}
                    aria-label={`Move ${song.title} down`}
                    disabled={i === shown.length - 1}
                    onClick={() => void reorder(i, i + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${btn} !px-2 !py-0.5`}
                    aria-label={`Remove ${song.title} from play list`}
                    onClick={() => void remove(song)}
                  >
                    Remove
                  </button>
                </span>
              </SongRow>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

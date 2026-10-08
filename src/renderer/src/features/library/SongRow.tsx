import type { ReactNode } from 'react'
import type { Song } from '@shared/types'
import { Cover } from '../../components/Cover'
import { useLibraryActions } from './LibraryContext'

interface Props {
  song: Song
  /** Index in the list this row belongs to, for building the play queue. */
  index: number
  /** The list the row is in, as the queue to play when it is double-clicked. */
  queue: readonly Song[]
  queueLabel: string
  style?: React.CSSProperties
  /** Extra controls at the right (reorder, remove...). */
  children?: ReactNode
  draggable?: boolean
  dragProps?: React.HTMLAttributes<HTMLElement>
}

/** One song in a list: cover, title, artist · album, favorite heart; click opens it, double-click plays it. */
export function SongRow({
  song,
  index,
  queue,
  queueLabel,
  style,
  children,
  draggable,
  dragProps
}: Props): React.JSX.Element {
  const actions = useLibraryActions()
  const sub = [song.artistName, song.albumTitle].filter(Boolean).join(' · ')
  return (
    <div
      role="listitem"
      aria-label={`${song.title} by ${song.artistName}`}
      style={style}
      draggable={draggable}
      {...dragProps}
      className={`flex items-center gap-3 border-b border-border px-4 hover:bg-surface-2 ${dragProps?.className ?? ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        actions.showMenu({ kind: 'song', song }, e.clientX, e.clientY)
      }}
    >
      <Cover src={song.coverPath} size={40} />
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start py-1 text-left"
        onClick={() => actions.openSong(song)}
        onDoubleClick={() => actions.playQueue(queue, index, queueLabel)}
        title="Click to open, double-click to play"
      >
        <span className="w-full truncate text-sm font-semibold">{song.title}</span>
        <span className="w-full truncate text-xs text-fg-muted">{sub}</span>
      </button>
      {children}
      <button
        type="button"
        aria-label={`${song.favorite ? 'Remove from favorites' : 'Add to favorites'}: ${song.title}`}
        aria-pressed={song.favorite}
        title={song.favorite ? 'Remove from favorites' : 'Add to favorites'}
        className={`px-1 text-lg leading-none hover:text-accent ${song.favorite ? 'text-accent' : 'text-fg-muted'}`}
        onClick={() => actions.toggleFavorite(song)}
      >
        {song.favorite ? '♥' : '♡'}
      </button>
    </div>
  )
}

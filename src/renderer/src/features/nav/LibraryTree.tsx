import { useCallback, useRef, useState } from 'react'
import { List, useListRef, type RowComponentProps } from 'react-window'
import type { Song } from '@shared/types'
import { Cover } from '../../components/Cover'
import type { MenuTarget } from './actions'
import type { NavId, TreeRow } from './tree-model'
import { useLibraryTree } from './useLibraryTree'

const ROW_HEIGHT = 34

interface Props {
  activeNav: NavId | null
  activeSongId: number | null
  onNav: (id: NavId) => void
  onOpenSong: (song: Song) => void
  onPlaySong: (song: Song) => void
  onMenu: (target: MenuTarget, x: number, y: number) => void
}

interface RowProps {
  rows: TreeRow[]
  focusIndex: number
  activeNav: NavId | null
  activeSongId: number | null
  activate: (row: TreeRow) => void
  playSong: (song: Song) => void
  menu: (row: TreeRow, x: number, y: number) => void
  onFocusRow: (index: number) => void
}

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 10 10"
      width="10"
      height="10"
      aria-hidden="true"
      className={`shrink-0 text-fg-muted transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="M3 1l5 4-5 4z" fill="currentColor" />
    </svg>
  )
}

function Row({
  index,
  style,
  rows,
  focusIndex,
  activeNav,
  activeSongId,
  activate,
  playSong,
  menu,
  onFocusRow
}: RowComponentProps<RowProps>): React.JSX.Element | null {
  const row = rows[index]
  if (!row) return null
  const selected =
    (row.kind === 'nav' && row.id === activeNav) ||
    (row.kind === 'song' && row.song.id === activeSongId)
  const expandable =
    (row.kind === 'nav' && row.expandable) || row.kind === 'artist' || row.kind === 'album'
  const expanded = 'expanded' in row ? row.expanded : false

  const common = {
    style: { ...style, paddingLeft: 8 + (row.level - 1) * 14 },
    'data-row': row.key,
    className: `flex items-center gap-2 pr-3 text-sm ${selected ? 'bg-surface-2 font-semibold' : ''}`
  }

  if (row.kind === 'status') {
    return (
      <div {...common} role="none" className={`${common.className} text-fg-muted italic`}>
        {row.text}
      </div>
    )
  }

  const label =
    row.kind === 'nav'
      ? row.label
      : row.kind === 'artist'
        ? row.artist.name
        : row.kind === 'album'
          ? row.album.title
          : row.song.title

  return (
    <div
      {...common}
      role="treeitem"
      aria-level={row.level}
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={selected}
      tabIndex={index === focusIndex ? 0 : -1}
      className={`${common.className} cursor-pointer hover:bg-surface-2`}
      onFocus={() => onFocusRow(index)}
      onClick={() => activate(row)}
      onDoubleClick={row.kind === 'song' ? () => playSong(row.song) : undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        menu(row, e.clientX, e.clientY)
      }}
    >
      {expandable ? <Chevron open={expanded} /> : <span className="w-[10px] shrink-0" />}
      {row.kind === 'album' && <Cover src={row.album.coverPath} size={24} />}
      {row.kind === 'song' && row.song.trackNo !== null && (
        <span className="w-5 shrink-0 text-right text-xs text-fg-muted">{row.song.trackNo}</span>
      )}
      <span className="truncate">{label}</span>
      {row.kind === 'artist' && (
        <span className="ml-auto text-xs text-fg-muted">{row.artist.songCount}</span>
      )}
      {row.kind === 'album' && (
        <span className="ml-auto text-xs text-fg-muted">{row.album.songCount}</span>
      )}
    </div>
  )
}

function targetOf(row: TreeRow): MenuTarget | null {
  switch (row.kind) {
    case 'nav':
      return row.id === 'artists' ? { kind: 'artists-root' } : null
    case 'artist':
      return { kind: 'artist', artist: row.artist }
    case 'album':
      return { kind: 'album', artist: row.artist, album: row.album }
    case 'song':
      return { kind: 'song', song: row.song }
    default:
      return null
  }
}

/** Library navigation: Search / Play Lists / Favorites / Artists with a virtualized Artist → Album → Song tree. */
export function LibraryTree({
  activeNav,
  activeSongId,
  onNav,
  onOpenSong,
  onPlaySong,
  onMenu
}: Props): React.JSX.Element {
  const tree = useLibraryTree()
  const { rows } = tree
  const [focusIndex, setFocusIndex] = useState(0)
  const listRef = useListRef(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const safeFocus = Math.max(0, Math.min(focusIndex, rows.length - 1))

  const focusRow = useCallback(
    (index: number) => {
      const i = Math.max(0, Math.min(index, rows.length - 1))
      setFocusIndex(i)
      listRef.current?.scrollToRow({ index: i, align: 'auto' })
      requestAnimationFrame(() => {
        const key = rows[i]?.key
        if (key)
          wrapper.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"]`)?.focus()
      })
    },
    [rows, listRef]
  )

  const activate = useCallback(
    (row: TreeRow) => {
      if (row.kind === 'nav') {
        if (row.id === 'artists') tree.toggleArtists()
        onNav(row.id)
      } else if (row.kind === 'artist') tree.toggleArtist(row.artist.id)
      else if (row.kind === 'album') tree.toggleAlbum(row.artist.id, row.album.id)
      else if (row.kind === 'song') onOpenSong(row.song)
    },
    [tree, onNav, onOpenSong]
  )

  const menu = useCallback(
    (row: TreeRow, x: number, y: number) => {
      const t = targetOf(row)
      if (t) onMenu(t, x, y)
    },
    [onMenu]
  )

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const row = rows[safeFocus]
    if (!row) return
    const move = (to: number): void => {
      e.preventDefault()
      focusRow(to)
    }
    switch (e.key) {
      case 'ArrowDown':
        return move(safeFocus + 1)
      case 'ArrowUp':
        return move(safeFocus - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(rows.length - 1)
      case 'ArrowRight': {
        e.preventDefault()
        const expandable =
          (row.kind === 'nav' && row.expandable) || row.kind === 'artist' || row.kind === 'album'
        if (expandable && 'expanded' in row && !row.expanded) activate(row)
        else if (rows[safeFocus + 1] && rows[safeFocus + 1]!.level > row.level)
          focusRow(safeFocus + 1)
        return
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (tree.collapse(row)) return
        for (let i = safeFocus - 1; i >= 0; i--) {
          if (rows[i]!.level < row.level) return focusRow(i)
        }
        return
      }
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (row.kind === 'song') onPlaySong(row.song)
        else activate(row)
        return
      case 'ContextMenu':
      case 'F10': {
        if (e.key === 'F10' && !e.shiftKey) return
        e.preventDefault()
        const r = (e.target as HTMLElement).getBoundingClientRect()
        menu(row, r.left + 24, r.bottom)
      }
    }
  }

  return (
    <div ref={wrapper} className="h-full">
      <List
        listRef={listRef}
        role="tree"
        aria-label="Library"
        rowComponent={Row}
        rowCount={rows.length}
        rowHeight={ROW_HEIGHT}
        rowProps={{
          rows,
          focusIndex: safeFocus,
          activeNav,
          activeSongId,
          activate,
          playSong: onPlaySong,
          menu,
          onFocusRow: setFocusIndex
        }}
        onKeyDown={onKeyDown}
        className="py-2"
        style={{ height: '100%' }}
      />
    </div>
  )
}

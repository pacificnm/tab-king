import { useCallback, useEffect, useState } from 'react'
import type { Song } from '@shared/types'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { Flyout } from './components/Flyout'
import type { MenuAction } from './components/MenuBar'
import { btnPrimary } from './components/Modal'
import { TitleBar } from './components/TitleBar'
import { menuFor, type LibraryAction, type MenuTarget } from './features/nav/actions'
import { LibraryTree } from './features/nav/LibraryTree'
import type { NavId } from './features/nav/tree-model'
import { SongDetail } from './features/song/SongDetail'
import { SongDialog } from './features/song/SongDialog'
import { DeleteSongDialog, EditAlbumDialog, RenameArtistDialog } from './features/song/SmallDialogs'

const VIEW_TITLES: Record<NavId, string> = {
  search: 'Search',
  playlists: 'Play Lists',
  favorites: 'Favorites',
  artists: 'Artists'
}
const COMING_SOON: Partial<Record<NavId, string>> = {
  search: 'Search arrives in a later release.',
  playlists: 'Play lists arrive in a later release.',
  favorites: 'Favorites arrive in a later release.'
}

type Dialog =
  | { kind: 'add'; preset?: { artist?: string; album?: string } }
  | { kind: 'edit-song'; song: Song }
  | { kind: 'delete-song'; song: Song }
  | { kind: 'edit-artist'; action: Extract<LibraryAction, { type: 'edit-artist' }> }
  | { kind: 'edit-album'; action: Extract<LibraryAction, { type: 'edit-album' }> }

export function App(): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<NavId | null>(null)
  const [songId, setSongId] = useState<number | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; target: MenuTarget } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.app.getInfo().then((i) => setVersion(i.version))
  }, [])

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeCtx = useCallback(() => setCtx(null), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const songGone = useCallback(() => setSongId(null), [])

  const onNav = useCallback((v: NavId) => {
    setSongId(null)
    setView(v)
    if (v !== 'artists') setMenuOpen(false)
  }, [])

  const openSong = useCallback((song: Song) => {
    setSongId(song.id)
    setMenuOpen(false)
  }, [])

  const onAction = useCallback((action: MenuAction) => {
    // Real dialogs/flyouts arrive in M6; stubbed here.
    setNotice(`"${action}" is not implemented yet`)
  }, [])

  /** Playback ships in M2; for now verify the files so missing ones are reported clearly (LIB-8). */
  const play = useCallback(async (target: MenuTarget | { kind: 'song'; song: Song }) => {
    if (target.kind !== 'song') {
      setNotice('Playback arrives in the next release')
      return
    }
    const missing = (await window.api.library.checkSong(target.song.id)).filter((c) => !c.exists)
    setNotice(
      missing.length > 0
        ? `Can't play "${target.song.title}": missing ${missing.map((m) => m.label).join(', ')}`
        : 'Playback arrives in the next release'
    )
  }, [])

  const runAction = useCallback(
    (a: LibraryAction) => {
      setMenuOpen(false)
      switch (a.type) {
        case 'add':
          return setDialog({ kind: 'add', preset: a.preset })
        case 'edit-song':
          return setDialog({ kind: 'edit-song', song: a.song })
        case 'delete-song':
          return setDialog({ kind: 'delete-song', song: a.song })
        case 'edit-artist':
          return setDialog({ kind: 'edit-artist', action: a })
        case 'edit-album':
          return setDialog({ kind: 'edit-album', action: a })
        case 'play':
          return void play(a.target)
      }
    },
    [play]
  )

  const showMenu = useCallback(
    (target: MenuTarget, x: number, y: number) => setCtx({ x, y, target }),
    []
  )

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const ctxItems: ContextMenuItem[] = ctx
    ? menuFor(ctx.target).map((m) => ({
        label: m.label,
        disabled: m.disabled,
        danger: m.danger,
        separator: m.separator,
        onSelect: m.action ? () => runAction(m.action!) : undefined
      }))
    : []

  return (
    <div className="relative flex h-full flex-col bg-bg text-fg">
      <TitleBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} onAction={onAction} />
      <Flyout open={menuOpen} side="left" label="Library" onClose={closeMenu}>
        <LibraryTree
          activeNav={view}
          activeSongId={songId}
          onNav={onNav}
          onOpenSong={openSong}
          onPlaySong={(s) => void play({ kind: 'song', song: s })}
          onMenu={showMenu}
        />
      </Flyout>

      <main className="flex min-h-0 flex-1 overflow-y-auto">
        {songId !== null ? (
          <SongDetail
            songId={songId}
            onEdit={(song) => setDialog({ kind: 'edit-song', song })}
            onDelete={(song) => setDialog({ kind: 'delete-song', song })}
            onPlay={(song) => void play({ kind: 'song', song })}
            onGone={songGone}
          />
        ) : (
          <div className="m-auto flex flex-col items-center gap-4 text-fg-muted">
            <p>{view ? VIEW_TITLES[view] : `Tab King ${version && `v${version}`}`}</p>
            {view && COMING_SOON[view] && <p className="text-sm">{COMING_SOON[view]}</p>}
            {(view === null || view === 'artists') && (
              <>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => setDialog({ kind: 'add' })}
                >
                  Add song…
                </button>
                <p className="text-sm">
                  Open the menu (☰) and choose Artists to browse your library.
                </p>
              </>
            )}
          </div>
        )}
      </main>

      {dialog?.kind === 'add' && (
        <SongDialog
          mode="add"
          preset={dialog.preset}
          onClose={closeDialog}
          onSaved={(song) => {
            closeDialog()
            setSongId(song.id)
          }}
        />
      )}
      {dialog?.kind === 'edit-song' && (
        <SongDialog mode="edit" song={dialog.song} onClose={closeDialog} onSaved={closeDialog} />
      )}
      {dialog?.kind === 'delete-song' && (
        <DeleteSongDialog
          song={dialog.song}
          onClose={closeDialog}
          onDeleted={() => {
            closeDialog()
            setSongId((id) => (id === dialog.song.id ? null : id))
          }}
        />
      )}
      {dialog?.kind === 'edit-artist' && (
        <RenameArtistDialog artist={dialog.action.artist} onClose={closeDialog} />
      )}
      {dialog?.kind === 'edit-album' && (
        <EditAlbumDialog album={dialog.action.album} onClose={closeDialog} />
      )}

      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={closeCtx} />}

      {notice && (
        <div
          role="status"
          className="absolute bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded bg-surface-2 px-4 py-2 text-sm shadow"
        >
          {notice}
        </div>
      )}
    </div>
  )
}

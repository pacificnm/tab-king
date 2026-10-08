import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { Song } from '@shared/types'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { Flyout } from './components/Flyout'
import type { MenuAction } from './components/MenuBar'
import { btnPrimary } from './components/Modal'
import { TitleBar } from './components/TitleBar'
import { usePlayerShortcuts } from './hooks/usePlayerShortcuts'
import { player, usePlayerStore } from './player'
import { Footer } from './features/player/Footer'
import { menuFor, type LibraryAction, type MenuTarget } from './features/nav/actions'
import { LibraryTree } from './features/nav/LibraryTree'
import type { NavId } from './features/nav/tree-model'
import { SongDetail } from './features/song/SongDetail'
import { SongDialog } from './features/song/SongDialog'
import { DeleteSongDialog, EditAlbumDialog, RenameArtistDialog } from './features/song/SmallDialogs'

// alphaTab is large: load the tab view only once something is played.
const TabView = lazy(() => import('./features/player/TabView'))

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
  const [showPlayer, setShowPlayer] = useState(false)
  const playerOpened = usePlayerStore((s) => s.openToken > 0)
  usePlayerShortcuts()

  useEffect(() => {
    void window.api.app.getInfo().then((i) => setVersion(i.version))
  }, [])

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeCtx = useCallback(() => setCtx(null), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const songGone = useCallback(() => setSongId(null), [])

  const onNav = useCallback((v: NavId) => {
    setSongId(null)
    setShowPlayer(false)
    setView(v)
    if (v !== 'artists') setMenuOpen(false)
  }, [])

  const openSong = useCallback((song: Song) => {
    setSongId(song.id)
    setShowPlayer(false)
    setMenuOpen(false)
  }, [])

  const onAction = useCallback((action: MenuAction) => {
    // Real dialogs/flyouts arrive in M6; stubbed here.
    setNotice(`"${action}" is not implemented yet`)
  }, [])

  /** Open a song in the player, first explaining any missing files (LIB-8). */
  const playSong = useCallback(async (song: Song) => {
    const missing = (await window.api.library.checkSong(song.id)).filter((c) => !c.exists)
    if (missing.some((m) => m.label === 'Guitar Pro file')) {
      setNotice(`Can't play "${song.title}": missing ${missing.map((m) => m.label).join(', ')}`)
      return
    }
    player.open(song, true)
    setShowPlayer(true)
    setMenuOpen(false)
  }, [])

  /** Play an artist/album: opens its first song (queue playback arrives with playlists). */
  const play = useCallback(
    async (target: MenuTarget) => {
      const lib = window.api.library
      let songs: Song[] = []
      if (target.kind === 'song') songs = [target.song]
      else if (target.kind === 'album')
        songs = await lib.listSongs(target.artist.id, target.album.id)
      else if (target.kind === 'artist') {
        const first = (await lib.listAlbums(target.artist.id))[0]
        songs = first
          ? await lib.listSongs(target.artist.id, first.id)
          : await lib.listSongs(target.artist.id, null)
      }
      const first = songs[0]
      if (first) await playSong(first)
      else setNotice('Nothing to play yet')
    },
    [playSong]
  )

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
          onPlaySong={(s) => void playSong(s)}
          onMenu={showMenu}
        />
      </Flyout>

      <main className="relative flex min-h-0 flex-1 overflow-y-auto">
        {playerOpened && (
          <div
            className={`absolute inset-0 z-10 bg-bg ${showPlayer ? '' : 'pointer-events-none invisible'}`}
            aria-hidden={!showPlayer}
            inert={!showPlayer}
          >
            <Suspense fallback={<p className="p-4 text-fg-muted">Loading player…</p>}>
              <TabView />
            </Suspense>
          </div>
        )}
        {/* Covered by the player while it's showing: inert so focus can't linger on hidden buttons. */}
        <div className="flex min-h-0 w-full flex-1" inert={showPlayer}>
          {songId !== null ? (
            <SongDetail
              songId={songId}
              onEdit={(song) => setDialog({ kind: 'edit-song', song })}
              onDelete={(song) => setDialog({ kind: 'delete-song', song })}
              onPlay={(song) => void playSong(song)}
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
        </div>
      </main>

      <Footer onShowPlayer={() => setShowPlayer(true)} />

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

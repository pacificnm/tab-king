import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaylistRow, Song } from '@shared/types'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { Flyout } from './components/Flyout'
import type { MenuAction } from './components/MenuBar'
import { btnPrimary } from './components/Modal'
import { TitleBar } from './components/TitleBar'
import { usePlayerShortcuts } from './hooks/usePlayerShortcuts'
import { player, usePlayerStore } from './player'
import { stepIndex } from './player/queue'
import { CollectionView, type Collection } from './features/library/CollectionView'
import { FavoritesView } from './features/library/FavoritesView'
import { LibraryActionsProvider, type LibraryActions } from './features/library/LibraryContext'
import { PlaylistsOverview } from './features/library/PlaylistsOverview'
import { PlaylistView } from './features/library/PlaylistView'
import { SearchView } from './features/library/SearchView'
import { menuFor, type LibraryAction, type MenuTarget } from './features/nav/actions'
import { LibraryTree } from './features/nav/LibraryTree'
import type { NavId } from './features/nav/tree-model'
import { Footer } from './features/player/Footer'
import {
  AddSongsDialog,
  AddToPlaylistDialog,
  DeletePlaylistDialog,
  PlaylistNameDialog
} from './features/playlist/PlaylistDialogs'
import { SongDetail } from './features/song/SongDetail'
import { SongDialog } from './features/song/SongDialog'
import { DeleteSongDialog, EditAlbumDialog, RenameArtistDialog } from './features/song/SmallDialogs'

/** How long the flyout stays open after a click on a song, so that a double-click can complete. */
const DOUBLE_CLICK_GRACE_MS = 300

// alphaTab is large: load the tab view only once something is played.
const TabView = lazy(() => import('./features/player/TabView'))

/** What the main area shows (below the title bar, above the player footer). */
type MainView =
  | { kind: 'home' }
  | { kind: 'song'; id: number }
  | { kind: 'search' }
  | { kind: 'favorites' }
  | { kind: 'playlists' }
  | { kind: 'playlist'; id: number }
  | { kind: 'collection'; collection: Collection }

type Dialog =
  | { kind: 'add'; preset?: { artist?: string; album?: string } }
  | { kind: 'edit-song'; song: Song }
  | { kind: 'delete-song'; song: Song }
  | { kind: 'edit-artist'; action: Extract<LibraryAction, { type: 'edit-artist' }> }
  | { kind: 'edit-album'; action: Extract<LibraryAction, { type: 'edit-album' }> }
  | { kind: 'new-playlist' }
  | { kind: 'rename-playlist'; playlist: PlaylistRow }
  | { kind: 'delete-playlist'; playlist: PlaylistRow }
  | { kind: 'add-to-playlist'; songs: Song[] }
  | { kind: 'add-songs'; playlist: PlaylistRow }

const navFor = (main: MainView): NavId | null =>
  main.kind === 'search'
    ? 'search'
    : main.kind === 'favorites'
      ? 'favorites'
      : main.kind === 'playlists' || main.kind === 'playlist'
        ? 'playlists'
        : null

export function App(): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [main, setMain] = useState<MainView>({ kind: 'home' })
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; target: MenuTarget } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const [showPlayer, setShowPlayer] = useState(false)
  const playerOpened = usePlayerStore((s) => s.openToken > 0)
  usePlayerShortcuts()
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    void window.api.app.getInfo().then((i) => setVersion(i.version))
  }, [])

  const closeMenu = useCallback(() => {
    clearTimeout(closeTimer.current)
    setMenuOpen(false)
  }, [])
  const closeCtx = useCallback(() => setCtx(null), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const songGone = useCallback(() => setMain({ kind: 'home' }), [])

  /** Show a view in the main area (leaving the player view and closing the flyout). */
  const show = useCallback((view: MainView, keepMenu = false) => {
    clearTimeout(closeTimer.current)
    setMain(view)
    setShowPlayer(false)
    if (!keepMenu) setMenuOpen(false)
  }, [])

  /**
   * A single click on a song in the tree opens its page, but the flyout lingers for a moment so a double-click
   * (play) can finish on the same row instead of landing on the page behind it.
   */
  const openSongFromTree = useCallback(
    (song: Song) => {
      show({ kind: 'song', id: song.id }, true)
      closeTimer.current = setTimeout(() => setMenuOpen(false), DOUBLE_CLICK_GRACE_MS)
    },
    [show]
  )
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const onNav = useCallback(
    (id: NavId) => {
      const view: MainView =
        id === 'search'
          ? { kind: 'search' }
          : id === 'favorites'
            ? { kind: 'favorites' }
            : id === 'playlists'
              ? { kind: 'playlists' }
              : { kind: 'home' }
      // Artists and Play Lists expand in place, so the flyout stays open for them.
      show(view, id === 'artists' || id === 'playlists')
    },
    [show]
  )

  const onAction = useCallback((action: MenuAction) => {
    // Real dialogs/flyouts arrive in M6; stubbed here.
    setNotice(`"${action}" is not implemented yet`)
  }, [])

  /** Open a song in the player, first explaining any missing files (LIB-8). Resolves to whether it opened. */
  const playSong = useCallback(async (song: Song): Promise<boolean> => {
    const missing = (await window.api.library.checkSong(song.id)).filter((c) => !c.exists)
    if (missing.some((m) => m.label === 'Guitar Pro file')) {
      setNotice(`Can't play "${song.title}": missing ${missing.map((m) => m.label).join(', ')}`)
      return false
    }
    player.open(song, true)
    setShowPlayer(true)
    clearTimeout(closeTimer.current)
    setMenuOpen(false)
    return true
  }, [])

  /** Play `queue[from]`, or the next playable song in `dir` if it can't be opened (PLY-8). */
  const playFrom = useCallback(
    async (from: number, dir: 1 | -1 = 1): Promise<void> => {
      const queue = usePlayerStore.getState().queue
      if (!queue) return
      for (let i = from; i >= 0 && i < queue.songs.length; i += dir) {
        player.setQueueIndex(i)
        if (await playSong(queue.songs[i]!)) return
      }
    },
    [playSong]
  )

  const playQueue = useCallback(
    (songs: readonly Song[], index: number, label: string) => {
      if (songs.length === 0) return setNotice('Nothing to play yet')
      player.setQueue(songs, index, label)
      void playFrom(index)
    },
    [playFrom]
  )

  /** A song on its own: queue its album so playback carries on (SPECS §5). */
  const playInContext = useCallback(
    async (song: Song): Promise<void> => {
      const siblings =
        song.albumId !== null
          ? await window.api.library.listSongs(song.artistId, song.albumId)
          : [song]
      const index = Math.max(
        0,
        siblings.findIndex((s) => s.id === song.id)
      )
      playQueue(siblings.length > 0 ? siblings : [song], index, song.albumTitle ?? song.title)
    },
    [playQueue]
  )

  const playPlaylist = useCallback(
    async (playlist: PlaylistRow): Promise<void> => {
      const songs = await window.api.library.playlists.songs(playlist.id)
      playQueue(songs, 0, `Play list: ${playlist.name}`)
    },
    [playQueue]
  )

  const play = useCallback(
    async (target: MenuTarget): Promise<void> => {
      const lib = window.api.library
      switch (target.kind) {
        case 'song':
          return playInContext(target.song)
        case 'album':
          return playQueue(
            await lib.listSongs(target.artist.id, target.album.id),
            0,
            target.album.title
          )
        case 'artist':
          return playQueue(await lib.listSongsByArtist(target.artist.id), 0, target.artist.name)
        case 'playlist':
          return playPlaylist(target.playlist)
        default:
          return
      }
    },
    [playInContext, playQueue, playPlaylist]
  )

  const stepSong = useCallback(
    (dir: 1 | -1) => {
      const queue = usePlayerStore.getState().queue
      const next = queue && stepIndex(queue, dir)
      if (next !== null && next !== undefined) void playFrom(next, dir)
    },
    [playFrom]
  )

  // Auto-advance: when a song plays through to its end, start the next in the queue.
  useEffect(
    () =>
      usePlayerStore.subscribe((state, prev) => {
        if (state.songEnded === prev.songEnded) return
        const queue = state.queue
        if (queue && queue.index + 1 < queue.songs.length) void playFrom(queue.index + 1, 1)
      }),
    [playFrom]
  )

  const toggleFavorite = useCallback(async (song: Song): Promise<void> => {
    const res = await window.api.library.setFavorite(song.id, !song.favorite)
    if (!res.ok) setNotice(res.error)
  }, [])

  const runAction = useCallback(
    (a: LibraryAction) => {
      // A quick toggle shouldn't dismiss the navigation flyout; everything else opens a dialog or view.
      if (a.type !== 'toggle-favorite') setMenuOpen(false)
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
        case 'toggle-favorite':
          return void toggleFavorite(a.song)
        case 'add-to-playlist':
          return setDialog({ kind: 'add-to-playlist', songs: [a.song] })
        case 'new-playlist':
          return setDialog({ kind: 'new-playlist' })
        case 'rename-playlist':
          return setDialog({ kind: 'rename-playlist', playlist: a.playlist })
        case 'delete-playlist':
          return setDialog({ kind: 'delete-playlist', playlist: a.playlist })
        case 'add-songs-to-playlist':
          return setDialog({ kind: 'add-songs', playlist: a.playlist })
      }
    },
    [play, toggleFavorite]
  )

  const showMenu = useCallback(
    (target: MenuTarget, x: number, y: number) => setCtx({ x, y, target }),
    []
  )

  const actions: LibraryActions = useMemo(
    () => ({
      openSong: (song) => show({ kind: 'song', id: song.id }),
      playQueue,
      openAlbum: (a) =>
        show({
          kind: 'collection',
          collection: { kind: 'album', id: a.id, artistId: a.artistId, title: a.title }
        }),
      openArtist: (a) =>
        show({ kind: 'collection', collection: { kind: 'artist', id: a.id, name: a.name } }),
      openPlaylist: (p) => show({ kind: 'playlist', id: p.id }),
      toggleFavorite: (song) => void toggleFavorite(song),
      showMenu
    }),
    [show, playQueue, toggleFavorite, showMenu]
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
    <LibraryActionsProvider value={actions}>
      <div className="relative flex h-full flex-col bg-bg text-fg">
        <TitleBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} onAction={onAction} />
        <Flyout open={menuOpen} side="left" label="Library" onClose={closeMenu}>
          <LibraryTree
            activeNav={navFor(main)}
            activeSongId={main.kind === 'song' ? main.id : null}
            onNav={onNav}
            onOpenSong={openSongFromTree}
            onOpenPlaylist={(p) => show({ kind: 'playlist', id: p.id })}
            onPlaySong={(s) => void playInContext(s)}
            onToggleFavorite={(s) => void toggleFavorite(s)}
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
            {main.kind === 'song' ? (
              <SongDetail
                songId={main.id}
                onEdit={(song) => setDialog({ kind: 'edit-song', song })}
                onDelete={(song) => setDialog({ kind: 'delete-song', song })}
                onPlay={(song) => void playInContext(song)}
                onToggleFavorite={(song) => void toggleFavorite(song)}
                onAddToPlaylist={(song) => setDialog({ kind: 'add-to-playlist', songs: [song] })}
                onGone={songGone}
              />
            ) : main.kind === 'search' ? (
              <SearchView />
            ) : main.kind === 'favorites' ? (
              <FavoritesView />
            ) : main.kind === 'playlists' ? (
              <PlaylistsOverview onNew={() => setDialog({ kind: 'new-playlist' })} />
            ) : main.kind === 'playlist' ? (
              <PlaylistView playlistId={main.id} onAction={runAction} onError={setNotice} />
            ) : main.kind === 'collection' ? (
              <CollectionView collection={main.collection} />
            ) : (
              <div className="m-auto flex flex-col items-center gap-4 text-fg-muted">
                <p>Tab King {version && `v${version}`}</p>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => setDialog({ kind: 'add' })}
                >
                  Add song…
                </button>
                <p className="text-sm">
                  Open the menu (☰) to search, browse Artists, or use Play Lists and Favorites.
                </p>
              </div>
            )}
          </div>
        </main>

        <Footer onShowPlayer={() => setShowPlayer(true)} onStepSong={stepSong} />

        {dialog?.kind === 'add' && (
          <SongDialog
            mode="add"
            preset={dialog.preset}
            onClose={closeDialog}
            onSaved={(song) => {
              closeDialog()
              show({ kind: 'song', id: song.id })
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
              setMain((m) => (m.kind === 'song' && m.id === dialog.song.id ? { kind: 'home' } : m))
            }}
          />
        )}
        {dialog?.kind === 'edit-artist' && (
          <RenameArtistDialog artist={dialog.action.artist} onClose={closeDialog} />
        )}
        {dialog?.kind === 'edit-album' && (
          <EditAlbumDialog album={dialog.action.album} onClose={closeDialog} />
        )}
        {dialog?.kind === 'new-playlist' && (
          <PlaylistNameDialog
            onClose={closeDialog}
            onDone={(created) => {
              closeDialog()
              if (created) show({ kind: 'playlist', id: created.id }, true)
            }}
          />
        )}
        {dialog?.kind === 'rename-playlist' && (
          <PlaylistNameDialog
            playlist={dialog.playlist}
            onClose={closeDialog}
            onDone={closeDialog}
          />
        )}
        {dialog?.kind === 'delete-playlist' && (
          <DeletePlaylistDialog
            playlist={dialog.playlist}
            onClose={closeDialog}
            onDeleted={() => {
              closeDialog()
              setMain((m) =>
                m.kind === 'playlist' && m.id === dialog.playlist.id ? { kind: 'playlists' } : m
              )
            }}
          />
        )}
        {dialog?.kind === 'add-to-playlist' && (
          <AddToPlaylistDialog
            songs={dialog.songs}
            onClose={closeDialog}
            onDone={(message) => {
              closeDialog()
              setNotice(message)
            }}
          />
        )}
        {dialog?.kind === 'add-songs' && (
          <AddSongsDialog
            playlist={dialog.playlist}
            onClose={closeDialog}
            onDone={(message) => {
              closeDialog()
              setNotice(message)
            }}
          />
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
    </LibraryActionsProvider>
  )
}

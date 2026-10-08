import { useEffect, useRef, useState } from 'react'
import type { PlaylistRow, Result, Song } from '@shared/types'
import { input } from '../../components/Modal'
import { DialogForm, useAction } from '../song/SmallDialogs'

/** Create (no `playlist`) or rename a play list. */
export function PlaylistNameDialog({
  playlist,
  onClose,
  onDone
}: {
  playlist?: PlaylistRow
  onClose: () => void
  onDone: (playlist: PlaylistRow | null) => void
}): React.JSX.Element {
  const [name, setName] = useState(playlist?.name ?? '')
  const created = useRef<PlaylistRow | null>(null)
  const { busy, error, submit } = useAction(
    async () => {
      if (playlist) return window.api.library.playlists.rename(playlist.id, name.trim())
      const res = await window.api.library.playlists.create(name.trim())
      if (res.ok) created.current = res.value
      return res
    },
    () => onDone(created.current)
  )
  return (
    <DialogForm
      title={playlist ? 'Rename play list' : 'New play list'}
      submitLabel={playlist ? 'Save' : 'Create'}
      busy={busy}
      error={error}
      canSubmit={name.trim() !== ''}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <label className="flex flex-col gap-1">
        Name
        <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
    </DialogForm>
  )
}

export function DeletePlaylistDialog({
  playlist,
  onClose,
  onDeleted
}: {
  playlist: PlaylistRow
  onClose: () => void
  onDeleted: () => void
}): React.JSX.Element {
  const { busy, error, submit } = useAction(
    () => window.api.library.playlists.delete(playlist.id),
    onDeleted
  )
  return (
    <DialogForm
      title="Delete play list"
      submitLabel="Delete"
      danger
      busy={busy}
      error={error}
      canSubmit
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <p>
        Delete the play list <strong>{playlist.name}</strong>? The songs stay in your library.
      </p>
    </DialogForm>
  )
}

const NEW = 'new'

/** Put songs in a play list: pick an existing one or make a new one on the spot. */
export function AddToPlaylistDialog({
  songs,
  onClose,
  onDone
}: {
  songs: Song[]
  onClose: () => void
  onDone: (message: string) => void
}): React.JSX.Element {
  const [lists, setLists] = useState<PlaylistRow[] | null>(null)
  const [choice, setChoice] = useState<string>(NEW)
  const [name, setName] = useState('')
  const message = useRef('')

  useEffect(() => {
    let cancelled = false
    void window.api.library.playlists.list().then((l) => {
      if (cancelled) return
      setLists(l)
      if (l[0]) setChoice(String(l[0].id))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { busy, error, submit } = useAction(
    async (): Promise<Result<unknown>> => {
      const api = window.api.library.playlists
      let target: PlaylistRow | undefined
      if (choice === NEW) {
        const made = await api.create(name.trim())
        if (!made.ok) return made
        target = made.value
      } else {
        target = lists?.find((l) => String(l.id) === choice)
      }
      if (!target) return { ok: false, error: 'That play list no longer exists' }
      const added = await api.add(
        target.id,
        songs.map((s) => s.id)
      )
      if (!added.ok) return added
      message.current =
        added.value === 0
          ? `Already in "${target.name}"`
          : `Added ${added.value} ${added.value === 1 ? 'song' : 'songs'} to "${target.name}"`
      return added
    },
    () => onDone(message.current)
  )

  const subject = songs.length === 1 ? songs[0]!.title : `${songs.length} songs`
  return (
    <DialogForm
      title="Add to play list"
      submitLabel="Add"
      busy={busy}
      error={error}
      canSubmit={lists !== null && (choice !== NEW || name.trim() !== '')}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <p>
        Add <strong>{subject}</strong> to:
      </p>
      <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        <legend className="sr-only">Play list</legend>
        {(lists ?? []).map((l) => (
          <label key={l.id} className="flex items-center gap-2">
            <input
              type="radio"
              name="playlist"
              checked={choice === String(l.id)}
              onChange={() => setChoice(String(l.id))}
            />
            {l.name} <span className="text-fg-muted">({l.songCount})</span>
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="playlist"
            checked={choice === NEW}
            onChange={() => setChoice(NEW)}
          />
          New play list…
        </label>
      </fieldset>
      {choice === NEW && (
        <label className="flex flex-col gap-1">
          Name
          <input
            className={input}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
    </DialogForm>
  )
}

/** Pick songs from the library (searchable) to append to a play list. */
export function AddSongsDialog({
  playlist,
  onClose,
  onDone
}: {
  playlist: PlaylistRow
  onClose: () => void
  onDone: (message: string) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [found, setFound] = useState<Song[]>([])
  const [picked, setPicked] = useState<Map<number, Song>>(new Map())
  const request = useRef(0)
  const message = useRef('')

  useEffect(() => {
    const mine = ++request.current
    const timer = setTimeout(() => {
      void window.api.library.search(text.trim()).then((r) => {
        if (request.current === mine) setFound(r.songs)
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [text])

  const { busy, error, submit } = useAction(
    async () => {
      const res = await window.api.library.playlists.add(playlist.id, [...picked.keys()])
      if (res.ok)
        message.current = `Added ${res.value} ${res.value === 1 ? 'song' : 'songs'} to "${playlist.name}"`
      return res
    },
    () => onDone(message.current)
  )

  const toggle = (song: Song): void =>
    setPicked((cur) => {
      const next = new Map(cur)
      if (!next.delete(song.id)) next.set(song.id, song)
      return next
    })

  return (
    <DialogForm
      title={`Add songs to ${playlist.name}`}
      submitLabel={picked.size > 0 ? `Add ${picked.size}` : 'Add'}
      busy={busy}
      error={error}
      canSubmit={picked.size > 0}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <input
        autoFocus
        className={input}
        type="search"
        aria-label="Find songs to add"
        placeholder="Search songs, artists, albums…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <ul aria-label="Matching songs" className="max-h-64 overflow-y-auto">
        {found.length === 0 && (
          <li className="py-2 text-fg-muted">
            {text.trim() ? 'No matching songs.' : 'Search to find songs.'}
          </li>
        )}
        {found.map((s) => (
          <li key={s.id}>
            <label className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s)} />
              <span className="min-w-0 flex-1 truncate">
                {s.title} <span className="text-fg-muted">— {s.artistName}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {picked.size > 0 && <p className="text-fg-muted">{picked.size} selected</p>}
    </DialogForm>
  )
}

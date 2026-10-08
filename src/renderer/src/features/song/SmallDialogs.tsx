import { useState } from 'react'
import type { AlbumRow, ArtistRow, Song } from '@shared/types'
import { btn, btnPrimary, input, Modal } from '../../components/Modal'

interface FormProps {
  title: string
  submitLabel: string
  busy: boolean
  error: string | null
  canSubmit: boolean
  onSubmit: () => void
  onClose: () => void
  children: React.ReactNode
  danger?: boolean
}

export function DialogForm({
  title,
  submitLabel,
  busy,
  error,
  canSubmit,
  onSubmit,
  onClose,
  children,
  danger
}: FormProps): React.JSX.Element {
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit && !busy) onSubmit()
        }}
      >
        <div className="flex flex-col gap-3 px-5 py-4 text-sm">{children}</div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <p role="alert" className="min-w-0 flex-1 text-sm text-danger">
            {error}
          </p>
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || busy}
            className={danger ? `${btnPrimary} !bg-danger !text-white` : btnPrimary}
          >
            {busy ? 'Working…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Run a Result-returning call, mapping failures to an inline message. */
export function useAction(
  run: () => Promise<{ ok: true } | { ok: false; error: string }>,
  done: () => void
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await run()
    setBusy(false)
    if (res.ok) done()
    else setError(res.error)
  }
  return { busy, error, submit }
}

export function RenameArtistDialog({
  artist,
  onClose
}: {
  artist: ArtistRow
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState(artist.name)
  const { busy, error, submit } = useAction(
    () => window.api.library.renameArtist(artist.id, name.trim()),
    onClose
  )
  return (
    <DialogForm
      title="Edit artist"
      submitLabel="Save"
      busy={busy}
      error={error}
      canSubmit={name.trim() !== ''}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <label className="flex flex-col gap-1">
        Name
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-fg-muted">
        Renaming to an existing artist merges the two. Files stay where they are.
      </p>
    </DialogForm>
  )
}

export function EditAlbumDialog({
  album,
  onClose
}: {
  album: AlbumRow
  onClose: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState(album.title)
  const [year, setYear] = useState(album.year?.toString() ?? '')
  const yearOk = /^\d{0,4}$/.test(year.trim())
  const { busy, error, submit } = useAction(
    () => window.api.library.updateAlbum(album.id, title.trim(), year.trim() ? Number(year) : null),
    onClose
  )
  return (
    <DialogForm
      title="Edit album"
      submitLabel="Save"
      busy={busy}
      error={error}
      canSubmit={title.trim() !== '' && yearOk}
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <label className="flex flex-col gap-1">
        Title
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Year
        <input
          className={input}
          value={year}
          inputMode="numeric"
          onChange={(e) => setYear(e.target.value)}
        />
      </label>
    </DialogForm>
  )
}

/** LIB-7: delete the DB rows and, after confirmation, the copied files. */
export function DeleteSongDialog({
  song,
  onClose,
  onDeleted
}: {
  song: Song
  onClose: () => void
  onDeleted: () => void
}): React.JSX.Element {
  const [deleteFiles, setDeleteFiles] = useState(true)
  const { busy, error, submit } = useAction(
    () => window.api.library.deleteSong(song.id, deleteFiles),
    onDeleted
  )
  return (
    <DialogForm
      title="Delete song"
      submitLabel="Delete"
      danger
      busy={busy}
      error={error}
      canSubmit
      onSubmit={() => void submit()}
      onClose={onClose}
    >
      <p>
        Delete <strong>{song.title}</strong> by {song.artistName} from your library?
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={deleteFiles}
          onChange={(e) => setDeleteFiles(e.target.checked)}
        />
        Also delete its copied files from the library folder
      </label>
    </DialogForm>
  )
}

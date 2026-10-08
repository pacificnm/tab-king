import { useEffect, useState } from 'react'
import type { FileCheck, Song } from '@shared/types'
import { btn, btnPrimary } from '../../components/Modal'
import { Cover } from '../../components/Cover'

interface Props {
  songId: number
  onEdit: (song: Song) => void
  onDelete: (song: Song) => void
  onPlay: (song: Song) => void
  onGone: () => void
}

function fmtDuration(ms: number | null): string | null {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Song header (cover, tags) plus a file health list so missing files are explained, never fatal (LIB-5, LIB-8). */
export function SongDetail({ songId, onEdit, onDelete, onPlay, onGone }: Props): React.JSX.Element {
  const [song, setSong] = useState<Song | null>(null)
  const [checks, setChecks] = useState<FileCheck[]>([])
  const [version, setVersion] = useState(0)

  useEffect(() => window.api.library.onChanged(() => setVersion((v) => v + 1)), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await window.api.library.getSong(songId)
      if (cancelled) return
      if (!s) return onGone()
      const c = await window.api.library.checkSong(songId)
      if (cancelled) return
      setSong(s)
      setChecks(c)
    })()
    return () => {
      cancelled = true
    }
  }, [songId, version, onGone])

  if (!song) return <p className="p-6 text-fg-muted">Loading…</p>

  const missing = checks.filter((c) => !c.exists)
  const meta = [song.albumTitle, song.year, song.genre, fmtDuration(song.durationMs)]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8" aria-label={song.title}>
      <header className="flex gap-6">
        <Cover src={song.coverPath} size={160} />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          <h1 className="truncate text-2xl font-bold">{song.title}</h1>
          <p className="truncate text-lg text-fg-muted">{song.artistName}</p>
          {meta && <p className="truncate text-sm text-fg-muted">{meta}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnPrimary} onClick={() => onPlay(song)}>
              Play
            </button>
            <button type="button" className={btn} onClick={() => onEdit(song)}>
              Edit
            </button>
            <button type="button" className={btn} onClick={() => onDelete(song)}>
              Delete
            </button>
          </div>
        </div>
      </header>

      {missing.length > 0 && (
        <div role="alert" className="rounded border border-danger px-4 py-3 text-sm">
          <strong>
            {missing.length === 1 ? '1 file is' : `${missing.length} files are`} missing from the
            library folder.
          </strong>{' '}
          The rest of the song still works; use Edit to choose replacement files.
        </div>
      )}

      <section aria-label="Files">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">Files</h2>
        <ul className="divide-y divide-border rounded border border-border text-sm">
          {checks.map((c) => (
            <li key={c.path} className="flex items-center gap-3 px-3 py-2">
              <span className={c.exists ? 'text-fg-muted' : 'text-danger'} aria-hidden="true">
                {c.exists ? '✓' : '✗'}
              </span>
              <span className="w-56 shrink-0 truncate">{c.label}</span>
              <span className="min-w-0 flex-1 truncate text-fg-muted" title={c.path}>
                {c.path.split('/').pop()}
              </span>
              {!c.exists && <span className="text-danger">Missing</span>}
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}

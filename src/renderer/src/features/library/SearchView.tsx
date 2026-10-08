import { useEffect, useRef, useState } from 'react'
import type { SearchResults } from '@shared/types'
import { Cover } from '../../components/Cover'
import { input } from '../../components/Modal'
import { useLibraryActions } from './LibraryContext'
import { SongRow } from './SongRow'
import { ViewHeader } from './ViewHeader'

const DEBOUNCE_MS = 150

function Section({
  title,
  count,
  children
}: {
  title: string
  count: number
  children: React.ReactNode
}): React.JSX.Element | null {
  if (count === 0) return null
  return (
    <section aria-label={title} className="mb-6">
      <h2 className="px-6 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {title} <span className="font-normal">({count})</span>
      </h2>
      {children}
    </section>
  )
}

/** Search as you type (NAV-4): full-text over title, artist, album and genre, grouped into songs, albums, artists. */
export function SearchView(): React.JSX.Element {
  const actions = useLibraryActions()
  const [text, setText] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [version, setVersion] = useState(0)
  const request = useRef(0)
  const lastText = useRef(text)

  useEffect(() => window.api.library.onChanged(() => setVersion((v) => v + 1)), [])

  // Debounce typing; re-run when the library changes (e.g. after toggling a favorite). Late replies are ignored.
  useEffect(() => {
    const trimmed = text.trim()
    const mine = ++request.current
    // Debounce typing only; a library change re-runs the same search right away.
    const typing = lastText.current !== text
    lastText.current = text
    const timer = setTimeout(
      () => {
        if (!trimmed) return void setResults(null)
        void window.api.library.search(trimmed).then((r) => {
          if (request.current === mine) setResults(r)
        })
      },
      typing ? DEBOUNCE_MS : 0
    )
    return () => clearTimeout(timer)
  }, [text, version])

  const total = results ? results.songs.length + results.albums.length + results.artists.length : 0
  const label = `Search "${text.trim()}"`

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ViewHeader title="Search" subtitle="Titles, artists, albums and genres" />
      <div className="px-6 py-3">
        <input
          autoFocus
          className={input}
          type="search"
          aria-label="Search the library"
          placeholder="Search songs, albums, artists…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results && results.songs.length > 0) {
              actions.playQueue(results.songs, 0, label)
            }
          }}
        />
        <p role="status" className="mt-1 text-xs text-fg-muted">
          {!text.trim()
            ? 'Type to search. Press Enter to play the first song.'
            : results === null
              ? 'Searching…'
              : total === 0
                ? `No matches for "${text.trim()}".`
                : `${total} ${total === 1 ? 'result' : 'results'}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {results && (
          <>
            <Section title="Songs" count={results.songs.length}>
              <div role="list" aria-label="Songs">
                {results.songs.map((s, i) => (
                  <SongRow
                    key={s.id}
                    song={s}
                    index={i}
                    queue={results.songs}
                    queueLabel={label}
                    style={{ height: 56 }}
                  />
                ))}
              </div>
            </Section>
            <Section title="Albums" count={results.albums.length}>
              <ul aria-label="Albums">
                {results.albums.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-border px-6 py-2 text-left hover:bg-surface-2"
                      onClick={() => actions.openAlbum(a)}
                    >
                      <Cover src={a.coverPath} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.title}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          {a.artistName}
                          {a.year ? ` · ${a.year}` : ''} · {a.songCount}{' '}
                          {a.songCount === 1 ? 'song' : 'songs'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Artists" count={results.artists.length}>
              <ul aria-label="Artists">
                {results.artists.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-border px-6 py-3 text-left hover:bg-surface-2"
                      onClick={() => actions.openArtist(a)}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {a.name}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {a.albumCount} {a.albumCount === 1 ? 'album' : 'albums'} · {a.songCount}{' '}
                        {a.songCount === 1 ? 'song' : 'songs'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

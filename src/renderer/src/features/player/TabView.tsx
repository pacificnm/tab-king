import { useEffect, useRef, useState } from 'react'
import { libraryUrl } from '@shared/types'
import { btn, input } from '../../components/Modal'
import { installDiagnostics, player, usePlayerStore } from '../../player'
import { currentSoundFontUrl } from '../../prefs/store'
import { PAD_MS } from '../../player/mp3-engine'
import { PlayerEngine } from '../../player/player-engine'
import { parseSmf, type ParsedSmf } from '../../player/smf'
import { SyncEditor } from './SyncEditor'
import { TrackPanel } from './TrackPanel'

const FONT_DIRECTORY = 'tabking://app/font/'

function RangeControls(): React.JSX.Element {
  const measureCount = usePlayerStore((s) => s.measureCount)
  const sections = usePlayerStore((s) => s.sections)
  const range = usePlayerStore((s) => s.range)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const disabled = measureCount === 0
  const apply = (a: string, b: string): void => {
    const x = Number(a)
    const y = b === '' ? x : Number(b)
    if (a !== '' && Number.isFinite(x) && Number.isFinite(y)) player.setRange(x, y)
  }
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Loop range">
      <span className="text-sm text-fg-muted">Bars</span>
      <input
        className={`${input} !w-16`}
        aria-label="First bar"
        inputMode="numeric"
        disabled={disabled}
        placeholder="from"
        value={from}
        onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && apply(from, to)}
      />
      <span aria-hidden="true">–</span>
      <input
        className={`${input} !w-16`}
        aria-label="Last bar"
        inputMode="numeric"
        disabled={disabled}
        placeholder="to"
        value={to}
        onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && apply(from, to)}
      />
      <button
        type="button"
        className={btn}
        disabled={disabled || from === ''}
        onClick={() => apply(from, to)}
      >
        Select
      </button>
      {sections.length > 0 && (
        <select
          className={`${input} !w-auto`}
          aria-label="Select a section"
          value=""
          onChange={(e) => {
            const s = sections[Number(e.target.value)]
            if (s) {
              setFrom(String(s.startMeasure))
              setTo(String(s.endMeasure))
              player.setRange(s.startMeasure, s.endMeasure)
            }
          }}
        >
          <option value="">Section…</option>
          {sections.map((s, i) => (
            <option key={`${s.name}-${i}`} value={i}>
              {s.name} ({s.startMeasure}–{s.endMeasure})
            </option>
          ))}
        </select>
      )}
      {range && (
        <button
          type="button"
          className={btn}
          onClick={() => {
            player.clearRange()
            setFrom('')
            setTo('')
          }}
        >
          Clear selection
        </button>
      )}
    </div>
  )
}

function SyncButton(): React.JSX.Element | null {
  const hasAudio = usePlayerStore((s) => s.hasMaster || s.tracks.some((t) => t.hasMp3))
  const ready = usePlayerStore((s) => s.status === 'ready')
  const [open, setOpen] = useState(false)
  if (!hasAudio) return null
  return (
    <>
      <button type="button" className={btn} disabled={!ready} onClick={() => setOpen(true)}>
        Sync audio…
      </button>
      {open && <SyncEditor onClose={() => setOpen(false)} />}
    </>
  )
}

function ViewControls(): React.JSX.Element {
  const zoom = usePlayerStore((s) => s.zoom)
  const layout = usePlayerStore((s) => s.layout)
  return (
    <div className="flex items-center gap-2" role="group" aria-label="View">
      <button
        type="button"
        className={btn}
        aria-label="Zoom out"
        onClick={() => player.setZoom(zoom - 0.1)}
      >
        −
      </button>
      <span className="w-12 text-center text-sm tabular-nums" aria-label="Zoom level">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        className={btn}
        aria-label="Zoom in"
        onClick={() => player.setZoom(zoom + 0.1)}
      >
        +
      </button>
      <button
        type="button"
        className={btn}
        aria-pressed={layout === 'horizontal'}
        onClick={() => player.setLayout(layout === 'page' ? 'horizontal' : 'page')}
      >
        {layout === 'page' ? 'Horizontal layout' : 'Page layout'}
      </button>
    </div>
  )
}

/** Renders the open song's tab/notation with cursor. The only component that hosts the player engine. */
export default function TabView(): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const engine = useRef<PlayerEngine | null>(null)
  const song = usePlayerStore((s) => s.song)
  const openToken = usePlayerStore((s) => s.openToken)
  const status = usePlayerStore((s) => s.status)
  const error = usePlayerStore((s) => s.error)

  useEffect(() => {
    if (!container.current || !scroller.current) return
    const e = new PlayerEngine(
      container.current,
      scroller.current,
      FONT_DIRECTORY,
      currentSoundFontUrl()
    )
    engine.current = e
    player.attach(e)
    if (window.api.app.diagnostics) installDiagnostics(PAD_MS)
    return () => {
      player.detach(e)
      engine.current = null
      e.destroy()
    }
  }, [])

  useEffect(() => {
    const e = engine.current
    const current = usePlayerStore.getState().song
    if (!e || !current || openToken === 0) return
    let cancelled = false
    void (async () => {
      try {
        // The track mix may have changed since this song object was fetched, so read it fresh.
        const [fresh, res] = await Promise.all([
          window.api.library.getSong(current.id),
          fetch(libraryUrl(current.gpPath))
        ])
        const song = fresh ?? current
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? 'The Guitar Pro file is missing from the library folder. Use Edit to choose a replacement.'
              : `The Guitar Pro file could not be read (HTTP ${res.status}).`
          )
        }
        const bytes = await res.arrayBuffer()
        let midi: ParsedSmf | null = null
        let midiError: string | null = null
        if (song.midiPath) {
          try {
            const m = await fetch(libraryUrl(song.midiPath))
            if (!m.ok)
              throw new Error(m.status === 404 ? 'the file is missing' : `HTTP ${m.status}`)
            midi = parseSmf(new Uint8Array(await m.arrayBuffer()))
          } catch (err) {
            midiError = `The attached MIDI file can't be used (${err instanceof Error ? err.message : String(err)}); playing the tab's own notes.`
          }
        }
        if (cancelled) return
        e.load(bytes, {
          mix: song.tracks,
          synthSource: song.synthSource,
          midi,
          masterSource: song.masterSource,
          masterUrl: song.masterMp3Path ? libraryUrl(song.masterMp3Path) : null,
          stemUrls: new Map(
            song.tracks.flatMap((t) =>
              t.mp3Path ? [[t.trackIndex, libraryUrl(t.mp3Path)] as const] : []
            )
          ),
          syncOffsetMs: song.syncOffsetMs,
          syncPoints: song.syncPoints
        })
        usePlayerStore.setState({ midiError })
      } catch (err) {
        if (!cancelled) player.fail(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openToken])

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{song?.title ?? 'No song open'}</p>
          <p className="truncate text-sm text-fg-muted">{song?.artistName}</p>
        </div>
        <RangeControls />
        <ViewControls />
        <SyncButton />
      </div>
      {error && (
        <p role="alert" className="border-b border-danger px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {status === 'loading' && (
        <p role="status" className="px-4 py-2 text-sm text-fg-muted">
          Loading…
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <TrackPanel />
        <div
          ref={scroller}
          className="min-h-0 min-w-0 flex-1 overflow-auto bg-white text-black"
          data-testid="tab-scroller"
        >
          <div ref={container} data-testid="tab-surface" />
        </div>
      </div>
    </div>
  )
}

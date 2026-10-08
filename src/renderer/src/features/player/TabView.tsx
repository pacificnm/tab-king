import { useEffect, useRef, useState } from 'react'
import { libraryUrl } from '@shared/types'
import { btn, input } from '../../components/Modal'
import { player, usePlayerStore } from '../../player'
import { PlayerEngine } from '../../player/player-engine'

const FONT_DIRECTORY = 'tabking://app/font/'
const SOUNDFONT_URL = 'tabking://app/soundfont/sonivox.sf3'

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
  const [soundFontError, setSoundFontError] = useState<string | null>(null)

  useEffect(() => {
    if (!container.current || !scroller.current) return
    const e = new PlayerEngine(container.current, scroller.current, FONT_DIRECTORY)
    engine.current = e
    player.attach(e)
    e.loadSoundFont(SOUNDFONT_URL).catch((err: unknown) =>
      setSoundFontError(err instanceof Error ? err.message : 'Sound could not be loaded')
    )
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
        const res = await fetch(libraryUrl(current.gpPath))
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? 'The Guitar Pro file is missing from the library folder. Use Edit to choose a replacement.'
              : `The Guitar Pro file could not be read (HTTP ${res.status}).`
          )
        }
        const bytes = await res.arrayBuffer()
        if (!cancelled) e.load(bytes)
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
      </div>
      {(error || soundFontError) && (
        <p role="alert" className="border-b border-danger px-4 py-2 text-sm text-danger">
          {error ?? soundFontError}
        </p>
      )}
      {status === 'loading' && (
        <p role="status" className="px-4 py-2 text-sm text-fg-muted">
          Loading…
        </p>
      )}
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto bg-white text-black"
        data-testid="tab-scroller"
      >
        <div ref={container} data-testid="tab-surface" />
      </div>
    </div>
  )
}

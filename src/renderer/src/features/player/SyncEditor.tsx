import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SyncPointRow } from '@shared/types'
import { btn, btnPrimary, input, Modal } from '../../components/Modal'
import { player, usePlayerStore } from '../../player'
import { PAD_MS } from '../../player/mp3-engine'
import { buildSyncMap, measureToMp3Ms, validateSyncPoints } from '../../player/sync-map'
import {
  columnPeaks,
  formatMs,
  msToX,
  viewAround,
  xToMs,
  type WaveformView
} from '../../player/waveform'

const WAVEFORM_HEIGHT = 150
const ZOOM_SPAN_MS = 20_000

const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Edit the start offset and sync points (SYN-1/2/3): see the audio, line bars up with it, hear the result. */
export function SyncEditor({ onClose }: { onClose: () => void }): React.JSX.Element {
  const song = usePlayerStore((s) => s.song)
  const measureCount = usePlayerStore((s) => s.measureCount)
  const mode = usePlayerStore((s) => s.playbackMode)
  const playing = usePlayerStore((s) => s.playing || s.countingIn)
  const currentMeasure = usePlayerStore((s) => s.currentMeasure)
  const hasMaster = usePlayerStore((s) => s.hasMaster)
  // What was saved when the editor opened: the starting point, and what Cancel restores.
  const [initial] = useState(() => ({
    offsetMs: usePlayerStore.getState().syncOffsetMs,
    points: usePlayerStore.getState().syncPoints
  }))
  const [offset, setOffset] = useState(initial.offsetMs)
  const [points, setPoints] = useState<SyncPointRow[]>(initial.points)
  const [zoomed, setZoomed] = useState(false)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [newMeasure, setNewMeasure] = useState(2)
  const [fromMeasure, setFromMeasure] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  const engine = mode === 'mp3' ? player.mp3Engine() : null
  const ctx = player.syncContext()
  const sourceId = engine?.loadedIds().includes('master') ? 'master' : engine?.loadedIds()[0]
  const peaks = engine && sourceId ? engine.peaksFor(sourceId) : null
  const durationMs = engine ? Math.max(0, engine.durationMs - PAD_MS) : 0

  const problems = useMemo(() => {
    const list = validateSyncPoints(offset, points, measureCount, durationMs || undefined)
    const out: { measure: number; message: string }[] = [...list]
    if (!Number.isInteger(offset) || offset < -PAD_MS) {
      out.unshift({
        measure: 1,
        message: `The start offset must be a whole number of at least -${PAD_MS} ms`
      })
    } else if (durationMs > 0 && offset > durationMs) {
      out.unshift({ measure: 1, message: 'The start offset is past the end of the audio' })
    }
    return out
  }, [offset, points, measureCount, durationMs])

  // Hear/see every change immediately; Cancel puts the saved values back.
  useEffect(() => {
    player.setSync(offset, points)
  }, [offset, points])

  // Follow the audio playhead.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const p = player.playheadFileMs()
      setPlayhead((prev) =>
        p === null ? null : prev !== null && Math.abs(prev - p) < 5 ? prev : p
      )
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const view: WaveformView = useMemo(
    () =>
      zoomed && durationMs > 0
        ? viewAround(playhead ?? 0, ZOOM_SPAN_MS, durationMs)
        : { startMs: 0, endMs: Math.max(durationMs, 1) },
    [zoomed, playhead, durationMs]
  )

  const map = useMemo(
    () =>
      ctx
        ? buildSyncMap({
            offsetMs: offset,
            points,
            barStartsMs: ctx.barStartsMs,
            tabEndMs: ctx.tabEndMs
          })
        : null,
    [ctx, offset, points]
  )

  // Draw the waveform, bar lines (where the current map puts each measure), anchors and the playhead.
  useEffect(() => {
    const el = canvas.current
    if (!el || !peaks || !ctx || !map) return
    const dpr = window.devicePixelRatio || 1
    const width = el.clientWidth
    el.width = Math.round(width * dpr)
    el.height = Math.round(WAVEFORM_HEIGHT * dpr)
    const g = el.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    g.clearRect(0, 0, width, WAVEFORM_HEIGHT)
    const mid = WAVEFORM_HEIGHT / 2
    g.fillStyle = cssVar('--c-fg-muted') || '#888'
    const cols = columnPeaks(peaks, view, width)
    for (let x = 0; x < width; x++) {
      const h = Math.max(1, cols[x]! * (mid - 4))
      g.fillRect(x, mid - h, 1, h * 2)
    }
    const anchors = new Set([1, ...points.map((p) => p.measure)])
    g.font = '11px system-ui, sans-serif'
    for (let m = 1; m <= measureCount; m++) {
      const ms = measureToMp3Ms(map, ctx.barStartsMs, ctx.tabEndMs, m)
      const x = msToX(ms, width, view)
      if (x < -1 || x > width + 1) continue
      const anchored = anchors.has(m)
      g.strokeStyle = anchored ? cssVar('--c-accent') || '#f5a524' : cssVar('--c-border') || '#444'
      g.lineWidth = anchored ? 2 : 1
      g.beginPath()
      g.moveTo(x, anchored ? 0 : 14)
      g.lineTo(x, WAVEFORM_HEIGHT)
      g.stroke()
      if (anchored || zoomed || measureCount <= 40) {
        g.fillStyle = cssVar('--c-fg') || '#fff'
        g.fillText(String(m), x + 3, 11)
      }
    }
    if (playhead !== null) {
      const x = msToX(playhead, width, view)
      g.strokeStyle = cssVar('--c-danger') || '#e33'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, WAVEFORM_HEIGHT)
      g.stroke()
    }
  }, [peaks, ctx, map, view, points, playhead, measureCount, zoomed])

  const seekFromClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      player.seekFileMs(xToMs(e.clientX - rect.left, rect.width, view))
    },
    [view]
  )

  const heard = (): number => Math.round(player.playheadFileMs() ?? playhead ?? 0)
  const setPoint = (measure: number, mp3Ms: number): void =>
    setPoints((cur) =>
      [...cur.filter((p) => p.measure !== measure), { measure, mp3Ms }].sort(
        (a, b) => a.measure - b.measure
      )
    )
  const nudge = (measure: number, delta: number): void =>
    setPoints((cur) =>
      cur.map((p) => (p.measure === measure ? { ...p, mp3Ms: p.mp3Ms + delta } : p))
    )
  const remove = (measure: number): void =>
    setPoints((cur) => cur.filter((p) => p.measure !== measure))

  const cancel = (): void => {
    player.setSync(initial.offsetMs, initial.points)
    onClose()
  }

  const save = async (): Promise<void> => {
    if (!song) return
    setSaving(true)
    setError(null)
    const res = await window.api.library.saveSync(song.id, { offsetMs: offset, points })
    setSaving(false)
    if (res.ok) onClose()
    else setError(res.error)
  }

  const usable = mode === 'mp3' && !!peaks && !!ctx

  return (
    <Modal title="Sync audio to tab" onClose={cancel} xl>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {!usable ? (
          <div className="flex flex-col items-start gap-3 text-sm">
            <p>
              Syncing needs MP3 audio to be playing.{' '}
              {hasMaster
                ? 'Switch the band to the master MP3 to edit.'
                : 'Give a track an MP3 and set its source to Track MP3.'}
            </p>
            {hasMaster && (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => player.setMasterSource('mp3')}
              >
                Use the master MP3
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              The orange lines are the bars you have anchored; the grey ones show where the tab
              currently expects every other bar. Move the playhead (click the waveform, or play),
              then set the offset or a bar&rsquo;s time until the lines sit on the beats you hear.
            </p>

            <canvas
              ref={canvas}
              aria-label="Audio waveform"
              role="img"
              className="w-full cursor-crosshair rounded border border-border bg-bg"
              style={{ height: WAVEFORM_HEIGHT }}
              onClick={seekFromClick}
            />

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button type="button" className={btnPrimary} onClick={player.togglePlay}>
                {playing ? 'Pause' : 'Play'}
              </button>
              <label className="flex items-center gap-2">
                Play from bar
                <input
                  className={`${input} !w-20`}
                  type="number"
                  min={1}
                  max={measureCount}
                  aria-label="Play from bar"
                  value={fromMeasure}
                  onChange={(e) => setFromMeasure(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  player.seekToMeasure(Math.min(Math.max(fromMeasure, 1), measureCount))
                  if (!playing) player.togglePlay()
                }}
              >
                Play from here
              </button>
              <button
                type="button"
                className={btn}
                aria-pressed={zoomed}
                onClick={() => setZoomed((z) => !z)}
              >
                {zoomed ? 'Show whole song' : 'Zoom to playhead'}
              </button>
              <span className="ml-auto tabular-nums text-fg-muted" aria-label="Playhead">
                {playhead !== null ? formatMs(playhead) : '–'}
              </span>
            </div>

            <section
              aria-label="Start offset"
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <label className="flex items-center gap-2 font-semibold">
                Start offset (ms)
                <input
                  className={`${input} !w-28`}
                  type="number"
                  step={10}
                  aria-label="Start offset (ms)"
                  value={offset}
                  onChange={(e) => setOffset(Math.round(Number(e.target.value)))}
                />
              </label>
              <span className="text-fg-muted">bar 1 starts at {formatMs(offset)}</span>
              {[-100, -10, 10, 100].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={btn}
                  aria-label={`Offset ${d > 0 ? '+' : ''}${d} ms`}
                  onClick={() => setOffset((o) => o + d)}
                >
                  {d > 0 ? '+' : ''}
                  {d}
                </button>
              ))}
              <button type="button" className={btn} onClick={() => setOffset(heard())}>
                Set to playhead
              </button>
            </section>

            <section aria-label="Sync points" className="flex flex-col gap-2 text-sm">
              <h3 className="font-semibold">Sync points</h3>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  Bar
                  <input
                    className={`${input} !w-20`}
                    type="number"
                    min={1}
                    max={measureCount}
                    aria-label="Bar to sync"
                    value={newMeasure}
                    onChange={(e) => setNewMeasure(Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => {
                    const m = Math.min(Math.max(Math.round(newMeasure), 1), measureCount)
                    if (m === 1) setOffset(heard())
                    else setPoint(m, heard())
                  }}
                >
                  Set bar here
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => setNewMeasure(Math.max(2, currentMeasure))}
                >
                  Use current bar ({currentMeasure})
                </button>
                {points.length > 0 && (
                  <button type="button" className={btn} onClick={() => setPoints([])}>
                    Remove all points
                  </button>
                )}
              </div>

              {points.length === 0 ? (
                <p className="text-fg-muted">
                  No sync points: the recording is assumed to keep the tab&rsquo;s tempo. Add one
                  wherever it drifts.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="text-xs uppercase text-fg-muted">
                    <tr>
                      <th className="py-1">Bar</th>
                      <th>Audio time (ms)</th>
                      <th></th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.measure} className="border-t border-border">
                        <td className="py-1 font-semibold">{p.measure}</td>
                        <td>
                          <input
                            className={`${input} !w-28`}
                            type="number"
                            step={10}
                            aria-label={`Audio time for bar ${p.measure}`}
                            value={p.mp3Ms}
                            onChange={(e) =>
                              setPoint(p.measure, Math.round(Number(e.target.value)))
                            }
                          />
                          <span className="ml-2 text-fg-muted">{formatMs(p.mp3Ms)}</span>
                        </td>
                        <td className="space-x-1">
                          <button
                            type="button"
                            className={btn}
                            aria-label={`Bar ${p.measure} earlier by 10 ms`}
                            onClick={() => nudge(p.measure, -10)}
                          >
                            −10
                          </button>
                          <button
                            type="button"
                            className={btn}
                            aria-label={`Bar ${p.measure} later by 10 ms`}
                            onClick={() => nudge(p.measure, 10)}
                          >
                            +10
                          </button>
                          <button
                            type="button"
                            className={btn}
                            onClick={() => setPoint(p.measure, heard())}
                          >
                            Set to playhead
                          </button>
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className={btn}
                            aria-label={`Delete sync point at bar ${p.measure}`}
                            onClick={() => remove(p.measure)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {problems.length > 0 && (
              <ul
                role="alert"
                aria-label="Sync problems"
                className="list-disc rounded border border-danger px-8 py-2 text-sm text-danger"
              >
                {problems.map((p, i) => (
                  <li key={`${p.measure}-${i}`}>{p.message}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-5 py-3">
        <p role="alert" className="min-w-0 flex-1 truncate text-sm text-danger">
          {error}
        </p>
        <button type="button" className={btn} onClick={cancel}>
          Cancel
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={!usable || problems.length > 0 || saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

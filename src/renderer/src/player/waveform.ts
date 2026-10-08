import { PEAKS_PER_SECOND } from './peaks'

/** A window onto the audio, in ms from the start of the file (pad excluded). */
export interface WaveformView {
  startMs: number
  endMs: number
}

/** A window of `spanMs` centred on `centerMs`, kept inside [0, durationMs]. */
export function viewAround(centerMs: number, spanMs: number, durationMs: number): WaveformView {
  const span = Math.min(spanMs, Math.max(durationMs, 1))
  const start = Math.min(Math.max(centerMs - span / 2, 0), Math.max(durationMs - span, 0))
  return { startMs: start, endMs: start + span }
}

export const msToX = (ms: number, width: number, view: WaveformView): number =>
  ((ms - view.startMs) / (view.endMs - view.startMs)) * width

export const xToMs = (x: number, width: number, view: WaveformView): number =>
  view.startMs + (x / width) * (view.endMs - view.startMs)

/** One peak per pixel column across the view (the largest envelope value falling in that column). */
export function columnPeaks(peaks: Float32Array, view: WaveformView, width: number): Float32Array {
  const out = new Float32Array(width)
  const perMs = PEAKS_PER_SECOND / 1000
  for (let x = 0; x < width; x++) {
    const from = Math.max(0, Math.floor(xToMs(x, width, view) * perMs))
    const to = Math.min(
      peaks.length,
      Math.max(from + 1, Math.ceil(xToMs(x + 1, width, view) * perMs))
    )
    let peak = 0
    for (let i = from; i < to; i++) if (peaks[i]! > peak) peak = peaks[i]!
    out[x] = peak
  }
  return out
}

/** `m:ss.mmm` for displaying positions in the editor. */
export function formatMs(ms: number): string {
  const sign = ms < 0 ? '-' : ''
  const abs = Math.round(Math.abs(ms))
  const m = Math.floor(abs / 60000)
  const s = Math.floor((abs % 60000) / 1000)
  return `${sign}${m}:${String(s).padStart(2, '0')}.${String(abs % 1000).padStart(3, '0')}`
}

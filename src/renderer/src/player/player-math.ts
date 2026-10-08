/** A measure's playback-tick span (first occurrence; ticks run through unrolled repeats). */
export interface BarSpan {
  /** Zero-based measure index. */
  index: number
  start: number
  end: number
}

export const MIN_SPEED = 0.25
export const MAX_SPEED = 2
export const SPEED_STEP = 0.05
/** Quarter-note ticks; Previous restarts the current measure unless we're within this of its start. */
export const RESTART_WINDOW_TICKS = 960 / 2

/** Index of the measure containing `tick` (clamped to the first/last measure). */
export function barAtTick(spans: readonly BarSpan[], tick: number): number {
  if (spans.length === 0) return 0
  let lo = 0
  let hi = spans.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (spans[mid]!.start <= tick) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Tick to seek to for "Previous": restart this measure, or go to the one before if already near its start. */
export function prevBarTick(spans: readonly BarSpan[], tick: number): number {
  if (spans.length === 0) return 0
  const cur = barAtTick(spans, tick)
  const bar = spans[cur]!
  if (tick - bar.start > RESTART_WINDOW_TICKS || cur === 0) return bar.start
  return spans[cur - 1]!.start
}

/** Tick to seek to for "Next": start of the next measure, or null on the last measure. */
export function nextBarTick(spans: readonly BarSpan[], tick: number): number | null {
  const cur = barAtTick(spans, tick)
  return spans[cur + 1]?.start ?? null
}

/** Round to the 5% grid and clamp to 25–200%. */
export function clampSpeed(speed: number): number {
  const stepped = Math.round(speed / SPEED_STEP) * SPEED_STEP
  return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, stepped)) * 100) / 100
}

export function stepSpeed(speed: number, direction: 1 | -1): number {
  return clampSpeed(speed + direction * SPEED_STEP)
}

/** Tempo (BPM) in effect at the start of measure `index`, following tempo automations. */
export function tempoAtBar(
  baseTempo: number,
  bars: readonly { tempoAutomations: readonly { value: number }[] }[],
  index: number
): number {
  let tempo = baseTempo
  for (let i = 0; i <= index && i < bars.length; i++) {
    const last = bars[i]!.tempoAutomations.at(-1)
    if (last) tempo = last.value
  }
  return tempo
}

/** `m:ss` (or `h:mm:ss` past an hour). */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export interface Section {
  name: string
  /** 1-based inclusive measure numbers. */
  startMeasure: number
  endMeasure: number
}

/** Sections from per-measure section names (null where a measure doesn't start one). */
export function sectionsFromMarkers(markers: readonly (string | null)[]): Section[] {
  const starts = markers.flatMap((name, i) => (name ? [{ name, i }] : []))
  return starts.map((s, n) => ({
    name: s.name,
    startMeasure: s.i + 1,
    endMeasure: (starts[n + 1]?.i ?? markers.length) as number
  }))
}

/** Clamp a user-entered 1-based measure range to the score, swapping if reversed. */
export function normalizeRange(
  a: number,
  b: number,
  measureCount: number
): { start: number; end: number } | null {
  if (measureCount <= 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null
  const clamp = (n: number): number => Math.min(measureCount, Math.max(1, Math.round(n)))
  const x = clamp(a)
  const y = clamp(b)
  return { start: Math.min(x, y), end: Math.max(x, y) }
}

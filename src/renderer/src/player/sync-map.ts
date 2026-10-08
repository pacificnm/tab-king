/**
 * Mapping between the tab's timeline and an MP3's (SYN-1/2/5). One map per song, shared by the master and all stems.
 *
 * Anchors pair a tab time (ms at 100% speed) with an MP3 time (ms into the file). Between anchors time is
 * interpolated linearly; before the first and after the last it continues with the nearest segment's ratio.
 * The first anchor is always bar 1 at the song's start offset; user sync points add anchors at later bars.
 */
export interface SyncPoint {
  /** 1-based measure number (2 or more; measure 1 is the start offset). */
  measure: number
  /** MP3 time at the start of that measure. */
  mp3Ms: number
}

export interface SyncAnchor {
  tabMs: number
  mp3Ms: number
  /** Zero-based bar and relative position (0–1) of the anchor, for handing to alphaTab. */
  barIndex: number
  barPosition: number
}

export interface SyncMap {
  /** Sorted, strictly increasing in both tabMs and mp3Ms. */
  anchors: readonly SyncAnchor[]
}

export interface SyncMapInput {
  offsetMs: number
  points: readonly SyncPoint[]
  /** Tab time at the start of every bar (ms at 100% speed), ascending. */
  barStartsMs: readonly number[]
  /** Tab time at the end of the last bar. */
  tabEndMs: number
}

/** Build the anchor list: start offset, user points, and a trailing anchor continuing the last segment's ratio. */
export function buildSyncMap({ offsetMs, points, barStartsMs, tabEndMs }: SyncMapInput): SyncMap {
  const bars = barStartsMs.length
  if (bars === 0) return { anchors: [] }
  const anchors: SyncAnchor[] = [
    { tabMs: barStartsMs[0]!, mp3Ms: offsetMs, barIndex: 0, barPosition: 0 }
  ]
  const sorted = [...points]
    .filter((p) => p.measure >= 2 && p.measure <= bars)
    .sort((a, b) => a.measure - b.measure)
  for (const p of sorted) {
    const last = anchors[anchors.length - 1]!
    const tabMs = barStartsMs[p.measure - 1]!
    // Ignore points that would make the mapping non-monotonic; validateSyncPoints reports them to the user.
    if (tabMs <= last.tabMs || p.mp3Ms <= last.mp3Ms) continue
    anchors.push({ tabMs, mp3Ms: p.mp3Ms, barIndex: p.measure - 1, barPosition: 0 })
  }
  const last = anchors[anchors.length - 1]!
  const prev = anchors[anchors.length - 2]
  const slope = prev ? (last.mp3Ms - prev.mp3Ms) / (last.tabMs - prev.tabMs) : 1
  if (tabEndMs > last.tabMs) {
    anchors.push({
      tabMs: tabEndMs,
      mp3Ms: last.mp3Ms + (tabEndMs - last.tabMs) * slope,
      barIndex: bars - 1,
      barPosition: 1
    })
  }
  return { anchors }
}

function segmentFor(
  anchors: readonly SyncAnchor[],
  value: number,
  key: 'tabMs' | 'mp3Ms'
): [SyncAnchor, SyncAnchor] | null {
  if (anchors.length === 0) return null
  if (anchors.length === 1)
    return [
      anchors[0]!,
      { ...anchors[0]!, tabMs: anchors[0]!.tabMs + 1, mp3Ms: anchors[0]!.mp3Ms + 1 }
    ]
  let i = 0
  while (i < anchors.length - 2 && anchors[i + 1]![key] <= value) i++
  return [anchors[i]!, anchors[i + 1]!]
}

/** Tab time → MP3 time. */
export function tabMsToMp3Ms(map: SyncMap, tabMs: number): number {
  const seg = segmentFor(map.anchors, tabMs, 'tabMs')
  if (!seg) return tabMs
  const [a, b] = seg
  return a.mp3Ms + ((tabMs - a.tabMs) * (b.mp3Ms - a.mp3Ms)) / (b.tabMs - a.tabMs)
}

/** MP3 time → tab time (inverse of {@link tabMsToMp3Ms}). */
export function mp3MsToTabMs(map: SyncMap, mp3Ms: number): number {
  const seg = segmentFor(map.anchors, mp3Ms, 'mp3Ms')
  if (!seg) return mp3Ms
  const [a, b] = seg
  return a.tabMs + ((mp3Ms - a.mp3Ms) * (b.tabMs - a.tabMs)) / (b.mp3Ms - a.mp3Ms)
}

/** Position of a (1-based) measure, plus an optional 0–1 fraction through it, in MP3 time. */
export function measureToMp3Ms(
  map: SyncMap,
  barStartsMs: readonly number[],
  tabEndMs: number,
  measure: number,
  fraction = 0
): number {
  const i = Math.min(Math.max(measure, 1), barStartsMs.length) - 1
  const start = barStartsMs[i] ?? 0
  const end = barStartsMs[i + 1] ?? tabEndMs
  return tabMsToMp3Ms(map, start + (end - start) * fraction)
}

/** The measure (1-based) and 0–1 fraction at an MP3 time. */
export function mp3MsToMeasure(
  map: SyncMap,
  barStartsMs: readonly number[],
  tabEndMs: number,
  mp3Ms: number
): { measure: number; fraction: number } {
  const tab = mp3MsToTabMs(map, mp3Ms)
  let i = 0
  while (i < barStartsMs.length - 1 && barStartsMs[i + 1]! <= tab) i++
  const start = barStartsMs[i] ?? 0
  const end = barStartsMs[i + 1] ?? tabEndMs
  return { measure: i + 1, fraction: end > start ? (tab - start) / (end - start) : 0 }
}

export interface SyncProblem {
  measure: number
  message: string
}

/** Check user sync points; the editor refuses to save while there are problems. */
export function validateSyncPoints(
  offsetMs: number,
  points: readonly SyncPoint[],
  measureCount: number,
  mp3DurationMs?: number
): SyncProblem[] {
  const problems: SyncProblem[] = []
  const seen = new Set<number>()
  const sorted = [...points].sort((a, b) => a.measure - b.measure)
  let prevMs = offsetMs
  let prevMeasure = 1
  for (const p of sorted) {
    if (!Number.isInteger(p.measure) || p.measure < 2 || p.measure > measureCount) {
      problems.push({
        measure: p.measure,
        message: `Measure ${p.measure} is outside 2–${measureCount}`
      })
      continue
    }
    if (seen.has(p.measure)) {
      problems.push({
        measure: p.measure,
        message: `Measure ${p.measure} has more than one sync point`
      })
      continue
    }
    seen.add(p.measure)
    if (!Number.isFinite(p.mp3Ms) || p.mp3Ms < 0) {
      problems.push({
        measure: p.measure,
        message: `Measure ${p.measure}: time must be zero or more`
      })
    } else if (p.mp3Ms <= prevMs) {
      problems.push({
        measure: p.measure,
        message:
          prevMeasure === 1
            ? `Measure ${p.measure} must come after the start offset (${Math.round(offsetMs)} ms)`
            : `Measure ${p.measure} must be later in the audio than measure ${prevMeasure}`
      })
    } else if (mp3DurationMs !== undefined && p.mp3Ms > mp3DurationMs) {
      problems.push({
        measure: p.measure,
        message: `Measure ${p.measure} is past the end of the audio`
      })
    } else {
      prevMs = p.mp3Ms
      prevMeasure = p.measure
    }
  }
  return problems
}

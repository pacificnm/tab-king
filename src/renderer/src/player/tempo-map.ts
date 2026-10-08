export interface TempoEvent {
  tick: number
  bpm: number
}

/**
 * Build a tick → milliseconds function (at 100% speed) from the MIDI tempo events.
 * `division` is ticks per quarter note (alphaTab uses 960).
 */
export function buildTickToMs(
  tempos: readonly TempoEvent[],
  division = 960
): (tick: number) => number {
  const sorted = [...tempos].sort((a, b) => a.tick - b.tick)
  if (sorted.length === 0 || sorted[0]!.tick > 0) sorted.unshift({ tick: 0, bpm: 120 })
  // cumulative ms at the start of each tempo segment
  const startMs: number[] = [0]
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    startMs.push(startMs[i - 1]! + ((sorted[i]!.tick - prev.tick) * 60000) / (prev.bpm * division))
  }
  return (tick: number): number => {
    let i = sorted.length - 1
    while (i > 0 && sorted[i]!.tick > tick) i--
    const seg = sorted[i]!
    return startMs[i]! + ((tick - seg.tick) * 60000) / (seg.bpm * division)
  }
}

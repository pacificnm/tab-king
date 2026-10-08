import { usePlayerStore } from './store'

let timer: ReturnType<typeof setTimeout> | undefined

/** Write the current song's mix and source choices to the library (debounced). Practice state is transient. */
export function flushMix(): void {
  clearTimeout(timer)
  timer = undefined
  const { song, tracks, synthSource, hasMidi, masterSource, hasMaster } = usePlayerStore.getState()
  if (!song || tracks.length === 0) return
  void window.api.library.saveMix(song.id, {
    synthSource: hasMidi ? synthSource : 'gp',
    masterSource: hasMaster ? masterSource : 'synth',
    tracks: tracks.map((t) => ({
      trackIndex: t.index,
      source: t.hasMp3 ? t.source : 'synth',
      volume: t.volume,
      muted: t.muted,
      solo: t.solo
    }))
  })
}

export function scheduleSaveMix(): void {
  clearTimeout(timer)
  timer = setTimeout(flushMix, 400)
}

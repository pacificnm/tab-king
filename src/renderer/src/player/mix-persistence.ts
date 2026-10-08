import { usePlayerStore } from './store'

let timer: ReturnType<typeof setTimeout> | undefined

/** Write the current song's track mix to the library (debounced). Practice-view state is transient and not saved. */
export function flushMix(): void {
  clearTimeout(timer)
  timer = undefined
  const { song, tracks, synthSource, hasMidi } = usePlayerStore.getState()
  if (!song || tracks.length === 0) return
  void window.api.library.saveMix(song.id, {
    synthSource: hasMidi ? synthSource : 'gp',
    tracks: tracks.map((t) => ({
      trackIndex: t.index,
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

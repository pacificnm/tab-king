import type { Song } from '@shared/types'

/** What is playing "after" the current song: an album, a playlist, search results... (PLY-8). */
export interface Queue {
  songs: Song[]
  /** Index of the song that is open in the player. */
  index: number
  /** Where the queue came from, shown in the footer. */
  label: string
}

/** A queue starting at `startIndex`, or null if there is nothing to play. */
export function makeQueue(songs: readonly Song[], startIndex: number, label: string): Queue | null {
  if (songs.length === 0) return null
  return { songs: [...songs], index: Math.min(Math.max(startIndex, 0), songs.length - 1), label }
}

/** Index one step in `direction`, or null at either end. */
export function stepIndex(queue: Queue, direction: 1 | -1): number | null {
  const next = queue.index + direction
  return next >= 0 && next < queue.songs.length ? next : null
}

/** Whether Previous/Next song make sense (more than one song). */
export const hasSiblings = (queue: Queue | null): queue is Queue =>
  !!queue && queue.songs.length > 1

/** Re-point a queue at `songId` (e.g. the user opened another song from the same list); null if it isn't in it. */
export function seekQueue(queue: Queue, songId: number): Queue | null {
  const index = queue.songs.findIndex((s) => s.id === songId)
  return index < 0 ? null : { ...queue, index }
}

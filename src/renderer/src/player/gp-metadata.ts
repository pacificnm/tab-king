import { importer, Settings } from '@coderline/alphatab'

export interface GpTrackInfo {
  index: number
  name: string
  instrument: string | null
}

export interface GpMetadata {
  title: string
  artist: string
  album: string
  tracks: GpTrackInfo[]
}

const GM_FAMILIES = [
  'Piano',
  'Chromatic percussion',
  'Organ',
  'Guitar',
  'Bass',
  'Strings',
  'Ensemble',
  'Brass',
  'Reed',
  'Pipe',
  'Synth lead',
  'Synth pad',
  'Synth effects',
  'Ethnic',
  'Percussive',
  'Sound effects'
]

/** Instrument family for a General MIDI program number, or Drums for percussion staves. */
export function instrumentName(program: number, percussion: boolean): string {
  return percussion ? 'Drums' : (GM_FAMILIES[Math.floor(program / 8)] ?? 'Instrument')
}

/** Parse a Guitar Pro file just far enough to prefill the Add Song form. Throws on unreadable files. */
export function readGpMetadata(bytes: Uint8Array): GpMetadata {
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings())
  return {
    title: score.title.trim(),
    artist: score.artist.trim(),
    album: score.album.trim(),
    tracks: score.tracks.map((t, i) => ({
      index: i,
      name: t.name.trim() || `Track ${i + 1}`,
      instrument: instrumentName(
        t.playbackInfo.program,
        t.staves.some((s) => s.isPercussion)
      )
    }))
  }
}

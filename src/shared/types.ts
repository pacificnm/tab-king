export type AudioSource = 'synth' | 'mp3'
/** Where the synth takes its notes from: the tab-derived MIDI or the attached MIDI file. */
export type SynthSource = 'gp' | 'midi'

export interface ArtistRow {
  id: number
  name: string
  albumCount: number
  songCount: number
}

export interface AlbumRow {
  id: number
  artistId: number
  title: string
  year: number | null
  coverPath: string | null
  songCount: number
}

/** MP3 time at the start of a measure (SYN-2). */
export interface SyncPointRow {
  /** 1-based, 2 or more (measure 1 is the song's start offset). */
  measure: number
  mp3Ms: number
}

export interface SongTrack {
  trackIndex: number
  name: string
  instrument: string | null
  mp3Path: string | null
  source: AudioSource
  /** 1 = 100%. */
  volume: number
  muted: boolean
  solo: boolean
}

export interface Song {
  id: number
  albumId: number | null
  artistId: number
  artistName: string
  albumTitle: string | null
  coverPath: string | null
  title: string
  trackNo: number | null
  genre: string | null
  year: number | null
  gpPath: string
  midiPath: string | null
  masterMp3Path: string | null
  masterSource: AudioSource
  synthSource: SynthSource
  syncOffsetMs: number
  syncPoints: SyncPointRow[]
  durationMs: number | null
  tracks: SongTrack[]
}

/** Fields supplied when creating or replacing a song. Paths are relative to the library folder. */
export interface SongInput {
  artist: string
  album: string | null
  albumYear?: number | null
  coverPath?: string | null
  title: string
  trackNo?: number | null
  genre?: string | null
  year?: number | null
  gpPath: string
  midiPath?: string | null
  masterMp3Path?: string | null
  masterSource?: AudioSource
  synthSource?: SynthSource
  syncOffsetMs?: number
  durationMs?: number | null
  tracks?: SongTrack[]
}

/** User-facing outcome of an operation that can fail for reasons the UI should explain (LIB-8). */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export type PickKind = 'gp' | 'midi' | 'mp3'

/** A file the user chose in the native picker. The renderer only ever holds an opaque token, not a path. */
export interface PickedFile {
  token: string
  name: string
}

export interface Id3Info {
  title: string | null
  artist: string | null
  album: string | null
  year: number | null
  trackNo: number | null
  genre: string | null
  durationMs: number | null
  /** Embedded cover art as a data URL for preview, if present. */
  coverDataUrl: string | null
}

/** Where a song's file slot gets its content on save. */
export type FileRef = { existing: string } | { token: string } | null

export type CoverChoice = 'keep' | 'id3' | 'none'

export interface TrackForm {
  trackIndex: number
  name: string
  instrument: string | null
  mp3: FileRef
  source: AudioSource
  volume: number
  muted: boolean
  solo: boolean
}

/** What the Add/Edit dialog submits. */
export interface SongForm {
  artist: string
  album: string | null
  title: string
  trackNo: number | null
  genre: string | null
  year: number | null
  durationMs: number | null
  gp: FileRef
  midi: FileRef
  masterMp3: FileRef
  masterSource: AudioSource
  synthSource: SynthSource
  syncOffsetMs: number
  tracks: TrackForm[]
  cover: CoverChoice
}

/** A track's mix state as saved from the track panel. */
export interface TrackMix {
  trackIndex: number
  /** Which audio represents this track: the synth or its stem MP3. */
  source: AudioSource
  volume: number
  muted: boolean
  solo: boolean
}

export interface SongMix {
  synthSource: SynthSource
  /** Which audio represents the whole band: the synth or the master MP3. */
  masterSource: AudioSource
  tracks: TrackMix[]
}

/** Start offset and sync points as saved by the sync editor (SYN-1/2/3). */
export interface SongSync {
  offsetMs: number
  points: SyncPointRow[]
}

export interface FileCheck {
  path: string
  label: string
  exists: boolean
}

/** Build the media URL for a library-relative path. */
export function libraryUrl(relPath: string): string {
  return `tabking://library/${relPath.split('/').map(encodeURIComponent).join('/')}`
}

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

export interface PlaylistRow {
  id: number
  name: string
  songCount: number
}

export interface AlbumHit extends AlbumRow {
  artistName: string
}

/** Search results grouped by type (NAV-4). */
export interface SearchResults {
  songs: Song[]
  albums: AlbumHit[]
  artists: ArtistRow[]
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
  favorite: boolean
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

/** Colour themes (PRF-1). `system` follows the OS light/dark setting. */
export const THEMES = ['system', 'light', 'dark', 'midnight', 'amber'] as const
export type ThemeName = (typeof THEMES)[number]

/** User preferences that live in the settings file (not in the library database, so they survive a restore). */
export interface Preferences {
  theme: ThemeName
  audio: {
    /** `MediaDeviceInfo.deviceId` of the output device, or null for the system default. */
    outputDeviceId: string | null
    /** Whether the metronome starts switched on. */
    metronomeOn: boolean
    /** Whether the 3-click count-in starts switched on. */
    countInOn: boolean
    /** File name of the user's SoundFont inside the app's soundfonts folder, or null for the bundled bank. */
    soundFont: string | null
  }
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  audio: { outputDeviceId: null, metronomeOn: false, countInOn: false, soundFont: null }
}

export const BUNDLED_SOUNDFONT_URL = 'tabking://app/soundfont/sonivox.sf3'

/** What the Preferences dialog shows: the stored preferences plus read-only facts main computes. */
export interface PreferencesView extends Preferences {
  /** Where the synth loads its SoundFont from (`tabking://` URL). */
  soundFontUrl: string
  locations: {
    libraryDir: string
    defaultLibraryDir: string
    backupDir: string
    defaultBackupDir: string
    dbPath: string
    dbSizeBytes: number
  }
}

/** A folder the user picked for the library, checked and waiting for a decision (PRF-2). */
export interface LibraryPlan {
  token: string
  path: string
  /** `empty`: a new folder (the files can be copied into it). `existing`: already a Tab King library. */
  mode: 'empty' | 'existing'
  /** Files and bytes that would be copied from the current library. */
  fileCount: number
  bytes: number
}

export interface LibraryMoveResult {
  view: PreferencesView
  copied: number
  /** True when the old files can now be removed (`prefs.removeOldLibrary`). */
  canRemoveOld: boolean
}

/** Contents of `manifest.json` in a backup archive (BKP-1). */
export interface BackupManifest {
  format: 1
  appVersion: string
  schemaVersion: number
  createdAt: string
  songCount: number
  fileCount: number
}

export interface BackupResult {
  path: string
  bytes: number
  manifest: BackupManifest
}

/** A backup archive picked for restore, validated and waiting for confirmation (BKP-2). */
export interface RestorePlan {
  token: string
  fileName: string
  manifest: BackupManifest
  bytes: number
}

/** Progress of a long-running main-process task. `total` 0 means unknown. */
export interface TaskProgress {
  task: 'backup' | 'restore' | 'migrate'
  done: number
  total: number
  label: string
}

export type UpdateCheck =
  | { status: 'up-to-date'; current: string; latest: string; url: string }
  | { status: 'available'; current: string; latest: string; url: string }

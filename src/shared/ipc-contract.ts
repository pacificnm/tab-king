import { z } from 'zod'
import { THEMES } from './types'
import type {
  AlbumRow,
  BackupResult,
  LibraryMoveResult,
  LibraryPlan,
  PreferencesView,
  RestorePlan,
  TaskProgress,
  UpdateCheck,
  ArtistRow,
  FileCheck,
  Id3Info,
  PickedFile,
  PickKind,
  PlaylistRow,
  Result,
  SearchResults,
  Song,
  SongForm,
  SongMix,
  SongSync
} from './types'

export { IPC } from './ipc-channels'

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.enum(['linux', 'win32', 'darwin'])
})
export type AppInfo = z.infer<typeof AppInfoSchema>

const FileRefSchema = z
  .union([z.object({ existing: z.string().min(1) }), z.object({ token: z.string().min(1) })])
  .nullable()
const AudioSourceSchema = z.enum(['synth', 'mp3'])
const SynthSourceSchema = z.enum(['gp', 'midi'])
const VolumeSchema = z.number().min(0).max(2)
const optText = z.string().trim().max(300).nullable()
const optInt = z.number().int().min(0).max(1_000_000_000).nullable()

/** Validated in main for every add/update request. */
export const SongFormSchema = z.object({
  artist: z.string().trim().min(1).max(300),
  album: optText.transform((v) => (v ? v : null)),
  title: z.string().trim().min(1).max(300),
  trackNo: optInt,
  genre: optText.transform((v) => (v ? v : null)),
  year: z.number().int().min(0).max(9999).nullable(),
  durationMs: optInt,
  gp: FileRefSchema,
  midi: FileRefSchema,
  masterMp3: FileRefSchema,
  masterSource: AudioSourceSchema,
  synthSource: SynthSourceSchema,
  syncOffsetMs: z.number().int().min(-3_600_000).max(3_600_000),
  tracks: z
    .array(
      z.object({
        trackIndex: z.number().int().min(0).max(999),
        name: z.string().max(300),
        instrument: z.string().max(300).nullable(),
        mp3: FileRefSchema,
        source: AudioSourceSchema,
        volume: VolumeSchema,
        muted: z.boolean(),
        solo: z.boolean()
      })
    )
    .max(256),
  cover: z.enum(['keep', 'id3', 'none'])
})

export const SongMixSchema = z.object({
  synthSource: SynthSourceSchema,
  masterSource: AudioSourceSchema,
  tracks: z
    .array(
      z.object({
        trackIndex: z.number().int().min(0).max(999),
        source: AudioSourceSchema,
        volume: VolumeSchema,
        muted: z.boolean(),
        solo: z.boolean()
      })
    )
    .max(256)
})

export const SongSyncSchema = z.object({
  offsetMs: z.number().int().min(-8000).max(3_600_000),
  points: z
    .array(
      z.object({
        measure: z.number().int().min(2).max(100_000),
        mp3Ms: z.number().int().min(0).max(36_000_000)
      })
    )
    .max(10_000)
})

/** Partial update of the preferences the renderer may change directly (locations and the SoundFont have their own calls). */
export const PreferencesPatchSchema = z
  .object({
    theme: z.enum(THEMES),
    audio: z
      .object({
        outputDeviceId: z.string().max(500).nullable(),
        metronomeOn: z.boolean(),
        countInOn: z.boolean()
      })
      .partial()
      .strict()
  })
  .partial()
  .strict()
export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>

/** API exposed to the renderer as `window.api`. */
export interface TabKingApi {
  win: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximizedChanged(cb: (maximized: boolean) => void): () => void
  }
  app: {
    getInfo(): Promise<AppInfo>
    /** True only when launched by the e2e harness; enables `window.__tabking` timing probes. */
    readonly diagnostics: boolean
    /** Progress of backup / restore / library moves. */
    onProgress(cb: (p: TaskProgress) => void): () => void
    /** User-initiated: asks GitHub Releases whether a newer version exists (ABT-2). */
    checkForUpdates(): Promise<Result<UpdateCheck>>
  }
  prefs: {
    get(): Promise<PreferencesView>
    update(patch: PreferencesPatch): Promise<Result<PreferencesView>>
    onChanged(cb: (view: PreferencesView) => void): () => void
    /** Folder picker for the library; null if cancelled. Pass `useDefault` to skip the picker. */
    chooseLibraryDir(useDefault?: boolean): Promise<Result<LibraryPlan | null>>
    /** Switch to the planned folder, copying the current files into it when `migrate` is set. */
    applyLibraryDir(token: string, migrate: boolean): Promise<Result<LibraryMoveResult>>
    /** Delete the files that the last move copied out of the old folder. */
    removeOldLibrary(): Promise<Result<number>>
    /** Folder picker for backups; null if cancelled. */
    chooseBackupDir(): Promise<Result<PreferencesView | null>>
    resetBackupDir(): Promise<Result<PreferencesView>>
    chooseSoundFont(): Promise<Result<PreferencesView | null>>
    resetSoundFont(): Promise<PreferencesView>
  }
  backup: {
    /** Writes a .zip of the database and library into the backup folder. */
    create(): Promise<Result<BackupResult>>
    /** File picker + validation; null if cancelled. */
    choose(): Promise<Result<RestorePlan | null>>
    /** Replaces the library with the archive's and restarts the app. */
    restore(token: string): Promise<Result<null>>
  }
  library: {
    listArtists(): Promise<ArtistRow[]>
    listAlbums(artistId: number): Promise<AlbumRow[]>
    /** Songs of an album, or the artist's album-less songs when `albumId` is null. */
    listSongs(artistId: number, albumId: number | null): Promise<Song[]>
    getSong(id: number): Promise<Song | null>
    /** All of an artist's songs, by album then track. */
    listSongsByArtist(artistId: number): Promise<Song[]>
    /** Full-text search over songs, plus matching albums and artists (NAV-4). */
    search(text: string): Promise<SearchResults>
    listFavorites(): Promise<Song[]>
    /** Returns the new state. */
    setFavorite(songId: number, favorite: boolean): Promise<Result<boolean>>
    playlists: {
      list(): Promise<PlaylistRow[]>
      create(name: string): Promise<Result<PlaylistRow>>
      rename(id: number, name: string): Promise<Result<null>>
      delete(id: number): Promise<Result<null>>
      songs(id: number): Promise<Song[]>
      /** Appends; resolves to how many were added (songs already in the playlist are skipped). */
      add(id: number, songIds: number[]): Promise<Result<number>>
      remove(id: number, songId: number): Promise<Result<null>>
      /** `songIds` must be exactly the playlist's current songs, in the new order. */
      reorder(id: number, songIds: number[]): Promise<Result<null>>
    }
    /** Opens the native file picker; resolves to [] if cancelled. */
    pickFiles(kind: PickKind): Promise<PickedFile[]>
    readPicked(token: string): Promise<Result<ArrayBuffer>>
    readId3(token: string): Promise<Result<Id3Info>>
    addSong(form: SongForm): Promise<Result<Song>>
    updateSong(id: number, form: SongForm): Promise<Result<Song>>
    deleteSong(id: number, deleteFiles: boolean): Promise<Result<null>>
    renameArtist(id: number, name: string): Promise<Result<null>>
    updateAlbum(id: number, title: string, year: number | null): Promise<Result<null>>
    /** Persist the track panel's mix (volume/mute/solo per track, synth source) for a song. */
    saveMix(songId: number, mix: SongMix): Promise<Result<null>>
    /** Persist the start offset and sync points (shared by the master and all stems). */
    saveSync(songId: number, sync: SongSync): Promise<Result<null>>
    checkSong(id: number): Promise<FileCheck[]>
    onChanged(cb: () => void): () => void
  }
}

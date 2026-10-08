import { z } from 'zod'
import type {
  AlbumRow,
  ArtistRow,
  FileCheck,
  Id3Info,
  PickedFile,
  PickKind,
  Result,
  Song,
  SongForm,
  SongMix
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
  tracks: z
    .array(
      z.object({
        trackIndex: z.number().int().min(0).max(999),
        volume: VolumeSchema,
        muted: z.boolean(),
        solo: z.boolean()
      })
    )
    .max(256)
})

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
  }
  library: {
    listArtists(): Promise<ArtistRow[]>
    listAlbums(artistId: number): Promise<AlbumRow[]>
    /** Songs of an album, or the artist's album-less songs when `albumId` is null. */
    listSongs(artistId: number, albumId: number | null): Promise<Song[]>
    getSong(id: number): Promise<Song | null>
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
    checkSong(id: number): Promise<FileCheck[]>
    onChanged(cb: () => void): () => void
  }
}

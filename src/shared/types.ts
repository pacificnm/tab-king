export type AudioSource = 'synth' | 'mp3'

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

export interface SongTrack {
  trackIndex: number
  name: string
  instrument: string | null
  mp3Path: string | null
  source: AudioSource
  volume: number
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
  syncOffsetMs: number
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
  syncOffsetMs?: number
  durationMs?: number | null
  tracks?: SongTrack[]
}

import type { AudioSource, CoverChoice, FileRef, Id3Info, Song, SongForm } from '@shared/types'
import type { GpMetadata } from '../../player/gp-metadata'

export type Slot =
  | { kind: 'none' }
  | { kind: 'existing'; path: string; name: string }
  | { kind: 'picked'; token: string; name: string }

export const NO_SLOT: Slot = { kind: 'none' }

export type TextField = 'title' | 'artist' | 'album' | 'year' | 'trackNo' | 'genre'
/** Where a field's current value came from; higher-priority sources are never overwritten by lower ones. */
export type Origin = 'none' | 'gp' | 'id3' | 'user'
const RANK: Record<Origin, number> = { none: 0, gp: 1, id3: 2, user: 3 }

export interface TrackState {
  trackIndex: number
  name: string
  instrument: string | null
  mp3: Slot
  source: AudioSource
  volume: number
}

export interface FormState {
  fields: Record<TextField, string>
  origin: Record<TextField, Origin>
  gp: Slot
  midi: Slot
  master: Slot
  masterSource: AudioSource
  syncOffsetMs: string
  tracks: TrackState[]
  durationMs: number | null
  cover: CoverChoice
  /** Cover preview URL: existing library cover or ID3 data URL. */
  coverPreview: string | null
  hadCover: boolean
}

const FIELDS: TextField[] = ['title', 'artist', 'album', 'year', 'trackNo', 'genre']
const blank = <T>(v: T): Record<TextField, T> =>
  Object.fromEntries(FIELDS.map((f) => [f, v])) as Record<TextField, T>
const fileName = (p: string): string => p.split('/').pop() ?? p

export function emptyState(preset?: { artist?: string; album?: string }): FormState {
  const s: FormState = {
    fields: blank(''),
    origin: blank<Origin>('none'),
    gp: NO_SLOT,
    midi: NO_SLOT,
    master: NO_SLOT,
    masterSource: 'synth',
    syncOffsetMs: '0',
    tracks: [],
    durationMs: null,
    cover: 'none',
    coverPreview: null,
    hadCover: false
  }
  if (preset?.artist) setField(s, 'artist', preset.artist)
  if (preset?.album) setField(s, 'album', preset.album)
  return s
}

export function stateFromSong(song: Song, coverUrl: string | null): FormState {
  const slot = (path: string | null): Slot =>
    path ? { kind: 'existing', path, name: fileName(path) } : NO_SLOT
  const fields = {
    title: song.title,
    artist: song.artistName,
    album: song.albumTitle ?? '',
    year: song.year?.toString() ?? '',
    trackNo: song.trackNo?.toString() ?? '',
    genre: song.genre ?? ''
  }
  return {
    fields,
    origin: blank<Origin>('user'),
    gp: slot(song.gpPath),
    midi: slot(song.midiPath),
    master: slot(song.masterMp3Path),
    masterSource: song.masterSource,
    syncOffsetMs: String(song.syncOffsetMs),
    tracks: song.tracks.map((t) => ({ ...t, mp3: slot(t.mp3Path) })),
    durationMs: song.durationMs,
    cover: 'keep',
    coverPreview: coverUrl,
    hadCover: !!coverUrl
  }
}

function setField(s: FormState, f: TextField, value: string, origin: Origin = 'user'): void {
  s.fields[f] = value
  s.origin[f] = origin
}

/** Set a field the user typed. */
export function editField(state: FormState, f: TextField, value: string): FormState {
  const next = { ...state, fields: { ...state.fields }, origin: { ...state.origin } }
  setField(next, f, value, 'user')
  return next
}

function prefill(
  state: FormState,
  values: Partial<Record<TextField, string | null>>,
  origin: Origin
): FormState {
  const next = { ...state, fields: { ...state.fields }, origin: { ...state.origin } }
  for (const f of FIELDS) {
    const v = values[f]
    if (v && RANK[origin] >= RANK[next.origin[f]] && next.origin[f] !== 'user')
      setField(next, f, v, origin)
  }
  return next
}

/** A GP file was chosen/parsed: fill gaps from its metadata and rebuild the track rows, keeping MP3s by index. */
export function applyGp(state: FormState, gp: GpMetadata): FormState {
  const next = prefill(state, { title: gp.title, artist: gp.artist, album: gp.album }, 'gp')
  const old = new Map(state.tracks.map((t) => [t.trackIndex, t]))
  next.tracks = gp.tracks.map((t) => {
    const prev = old.get(t.index)
    return {
      trackIndex: t.index,
      name: t.name,
      instrument: t.instrument,
      mp3: prev?.mp3 ?? NO_SLOT,
      source: prev?.source ?? 'synth',
      volume: prev?.volume ?? 1
    }
  })
  return next
}

/** ID3 tags from the master MP3 override GP metadata (LIB-3) but never what the user typed. */
export function applyId3(state: FormState, id3: Id3Info): FormState {
  const next = prefill(
    state,
    {
      title: id3.title,
      artist: id3.artist,
      album: id3.album,
      year: id3.year?.toString(),
      trackNo: id3.trackNo?.toString(),
      genre: id3.genre
    },
    'id3'
  )
  next.durationMs = id3.durationMs
  if (id3.coverDataUrl) {
    next.cover = 'id3'
    next.coverPreview = id3.coverDataUrl
  }
  return next
}

export function canSave(state: FormState): boolean {
  return (
    state.fields.title.trim() !== '' &&
    state.fields.artist.trim() !== '' &&
    state.gp.kind !== 'none' &&
    parseOptionalInt(state.fields.year) !== undefined &&
    parseOptionalInt(state.fields.trackNo) !== undefined &&
    Number.isInteger(Number(state.syncOffsetMs))
  )
}

/** '' -> null, integer string -> number, anything else -> undefined (invalid). */
export function parseOptionalInt(s: string): number | null | undefined {
  const t = s.trim()
  if (t === '') return null
  return /^\d{1,9}$/.test(t) ? Number(t) : undefined
}

const toRef = (s: Slot): FileRef =>
  s.kind === 'existing' ? { existing: s.path } : s.kind === 'picked' ? { token: s.token } : null

export function toSongForm(state: FormState): SongForm {
  const f = state.fields
  return {
    artist: f.artist.trim(),
    album: f.album.trim() || null,
    title: f.title.trim(),
    trackNo: parseOptionalInt(f.trackNo) ?? null,
    genre: f.genre.trim() || null,
    year: parseOptionalInt(f.year) ?? null,
    durationMs: state.durationMs,
    gp: toRef(state.gp),
    midi: toRef(state.midi),
    masterMp3: toRef(state.master),
    masterSource: state.master.kind === 'none' ? 'synth' : state.masterSource,
    syncOffsetMs: Number(state.syncOffsetMs) || 0,
    tracks: state.tracks.map((t) => ({
      trackIndex: t.trackIndex,
      name: t.name,
      instrument: t.instrument,
      mp3: toRef(t.mp3),
      source: t.mp3.kind === 'none' ? 'synth' : t.source,
      volume: t.volume
    })),
    cover: state.cover
  }
}

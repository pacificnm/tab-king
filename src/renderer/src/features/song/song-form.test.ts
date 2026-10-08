import { describe, expect, it } from 'vitest'
import type { Id3Info, Song } from '@shared/types'
import {
  applyGp,
  applyId3,
  canSave,
  editField,
  emptyState,
  parseOptionalInt,
  stateFromSong,
  toSongForm,
  type FormState,
  type Slot
} from './song-form'

const gp = {
  title: 'GP Title',
  artist: 'GP Artist',
  album: '',
  tracks: [
    { index: 0, name: 'Lead', instrument: 'Guitar' },
    { index: 1, name: 'Bass', instrument: 'Bass' }
  ]
}
const id3: Id3Info = {
  title: 'ID3 Title',
  artist: null,
  album: 'ID3 Album',
  year: 1981,
  trackNo: 2,
  genre: 'Rock',
  durationMs: 262000,
  coverDataUrl: 'data:image/png;base64,AA=='
}
const picked = (n: string): Slot => ({ kind: 'picked', token: `t-${n}`, name: n })

describe('prefill precedence', () => {
  it('GP fills blanks; ID3 overrides GP; user edits beat both', () => {
    let s = applyGp(emptyState(), gp)
    expect(s.fields).toMatchObject({ title: 'GP Title', artist: 'GP Artist', album: '' })
    s = applyId3(s, id3)
    expect(s.fields).toMatchObject({
      title: 'ID3 Title',
      artist: 'GP Artist',
      album: 'ID3 Album',
      year: '1981',
      trackNo: '2'
    })
    s = editField(s, 'title', 'Mine')
    s = applyId3(s, { ...id3, title: 'Other' })
    s = applyGp(s, { ...gp, title: 'GP again' })
    expect(s.fields.title).toBe('Mine')
  })

  it('does not let GP overwrite ID3 values when the GP is picked second', () => {
    let s = applyId3(emptyState(), id3)
    s = applyGp(s, { ...gp, title: 'GP Title', album: 'GP Album' })
    expect(s.fields.title).toBe('ID3 Title')
    expect(s.fields.album).toBe('ID3 Album')
    expect(s.fields.artist).toBe('GP Artist')
  })

  it('presets from "Add" on an artist/album count as user input', () => {
    const s = applyId3(emptyState({ artist: 'Rush', album: 'Signals' }), {
      ...id3,
      artist: 'Other'
    })
    expect(s.fields).toMatchObject({ artist: 'Rush', album: 'Signals' })
  })

  it('applies ID3 cover and duration', () => {
    const s = applyId3(emptyState(), id3)
    expect(s).toMatchObject({ cover: 'id3', coverPreview: id3.coverDataUrl, durationMs: 262000 })
  })
})

describe('tracks', () => {
  it('keeps picked MP3s by track index when the GP is replaced', () => {
    let s = applyGp(emptyState(), gp)
    s = {
      ...s,
      tracks: s.tracks.map((t) =>
        t.trackIndex === 1 ? { ...t, mp3: picked('bass.mp3'), source: 'mp3' } : t
      )
    }
    s = applyGp(s, {
      ...gp,
      tracks: [...gp.tracks, { index: 2, name: 'Drums', instrument: 'Drums' }]
    })
    expect(s.tracks.map((t) => t.mp3.kind)).toEqual(['none', 'picked', 'none'])
    s = applyGp(s, { ...gp, tracks: [gp.tracks[0]!] })
    expect(s.tracks).toHaveLength(1)
  })
})

describe('validation and output', () => {
  it('requires title, artist, GP and numeric fields', () => {
    let s = applyGp(emptyState(), gp)
    expect(canSave(s)).toBe(false)
    s = { ...s, gp: picked('a.gp') }
    expect(canSave(s)).toBe(true)
    expect(canSave(editField(s, 'year', '19x1'))).toBe(false)
    expect(canSave(editField(s, 'title', '  '))).toBe(false)
    expect(parseOptionalInt('')).toBeNull()
    expect(parseOptionalInt('12')).toBe(12)
    expect(parseOptionalInt('-1')).toBeUndefined()
  })

  it('builds a SongForm, forcing synth source when no MP3 is attached', () => {
    let s: FormState = {
      ...applyGp(emptyState(), gp),
      gp: picked('a.gp'),
      master: picked('m.mp3'),
      masterSource: 'mp3' as const
    }
    s = editField(s, 'album', ' LP ')
    const f = toSongForm(s)
    expect(f).toMatchObject({
      artist: 'GP Artist',
      album: 'LP',
      gp: { token: 't-a.gp' },
      masterMp3: { token: 't-m.mp3' },
      masterSource: 'mp3',
      midi: null,
      syncOffsetMs: 0
    })
    expect(f.tracks.every((t) => t.source === 'synth' && t.mp3 === null)).toBe(true)
    expect(toSongForm({ ...s, master: { kind: 'none' } }).masterSource).toBe('synth')
  })

  it('round-trips an existing song through edit state', () => {
    const song: Song = {
      id: 1,
      albumId: 1,
      artistId: 1,
      artistName: 'Rush',
      albumTitle: 'MP',
      coverPath: 'Rush/MP/cover.jpg',
      title: 'YYZ',
      trackNo: 2,
      genre: null,
      year: 1981,
      gpPath: 'Rush/MP/YYZ/y.gp',
      midiPath: null,
      masterMp3Path: 'Rush/MP/YYZ/m.mp3',
      masterSource: 'mp3',
      syncOffsetMs: 120,
      durationMs: 1000,
      tracks: [
        {
          trackIndex: 0,
          name: 'Lead',
          instrument: 'Guitar',
          mp3Path: null,
          source: 'synth',
          volume: 1
        }
      ]
    }
    const f = toSongForm(stateFromSong(song, 'tabking://library/x'))
    expect(f).toMatchObject({
      gp: { existing: song.gpPath },
      masterMp3: { existing: song.masterMp3Path },
      midi: null,
      title: 'YYZ',
      year: 1981,
      trackNo: 2,
      masterSource: 'mp3',
      syncOffsetMs: 120,
      cover: 'keep',
      durationMs: 1000
    })
  })
})

import { existsSync } from 'node:fs'
import type { FileCheck, FileRef, Song, SongForm, SongInput, SongTrack } from '@shared/types'
import { LibraryRepo, songFiles } from '../db/repo/library-repo'
import { coverExtension, readId3, type Id3Result } from './id3'
import type { PickedFiles } from './picked-files'
import type { LibraryStore } from './store'

type Id3Reader = (file: string) => Promise<Id3Result>

/** Add / edit / delete songs: file copying and DB writes as one unit, rolling back on failure (LIB-4/6/7). */
export class SongService {
  constructor(
    private readonly repo: LibraryRepo,
    private readonly store: LibraryStore,
    private readonly picked: PickedFiles,
    private readonly id3: Id3Reader = readId3
  ) {}

  async addSong(form: SongForm): Promise<Song> {
    validate(form)
    const created: string[] = []
    try {
      const dir = this.store.allocateSongDir(form.artist, form.album, form.title)
      created.push(`${dir}/`) // folder marker; removed with its files via prune
      return await this.save(null, form, dir, created)
    } catch (e) {
      this.rollback(created)
      throw e
    }
  }

  async updateSong(id: number, form: SongForm): Promise<Song> {
    validate(form)
    const before = this.repo.getSong(id)
    if (!before) throw new Error('Song no longer exists')
    const created: string[] = []
    try {
      const dir = before.gpPath.split('/').slice(0, -1).join('/')
      const song = await this.save(before, form, dir, created)
      return song
    } catch (e) {
      this.rollback(created)
      throw e
    }
  }

  deleteSong(id: number, deleteFiles: boolean): void {
    const song = this.repo.getSong(id)
    if (!song) return
    const files = this.repo.deleteSong(id)
    if (!deleteFiles) return
    for (const f of files) this.safeRemove(f)
    if (song.albumId !== null && song.coverPath && !this.repo.albumExists(song.albumId)) {
      this.safeRemove(song.coverPath)
    }
  }

  /** Report which of a song's files are missing on disk (LIB-8). */
  check(id: number): FileCheck[] {
    const song = this.repo.getSong(id)
    if (!song) return []
    const items: { path: string | null; label: string }[] = [
      { path: song.gpPath, label: 'Guitar Pro file' },
      { path: song.midiPath, label: 'MIDI file' },
      { path: song.masterMp3Path, label: 'Master MP3' },
      ...song.tracks.map((t) => ({
        path: t.mp3Path,
        label: `MP3 for track ${t.trackIndex + 1} (${t.name})`
      })),
      { path: song.coverPath, label: 'Cover art' }
    ]
    return items
      .filter((i): i is { path: string; label: string } => !!i.path)
      .map((i) => ({ path: i.path, label: i.label, exists: this.store.exists(i.path) }))
  }

  private async save(
    before: Song | null,
    form: SongForm,
    dir: string,
    created: string[]
  ): Promise<Song> {
    const current = new Set(before ? songFiles(before) : [])
    const slot = (ref: FileRef, prefix = ''): string | null => {
      if (!ref) return null
      if ('existing' in ref) {
        if (!current.has(ref.existing)) throw new Error('Unknown existing file reference')
        return ref.existing
      }
      const rel = this.store.copyIn(this.picked.resolve(ref.token), dir, prefix)
      created.push(rel)
      return rel
    }

    const gpPath = slot(form.gp)
    if (!gpPath) throw new Error('A Guitar Pro file is required')
    const midiPath = slot(form.midi)
    const masterMp3Path = slot(form.masterMp3)
    const tracks: SongTrack[] = form.tracks.map((t) => ({
      trackIndex: t.trackIndex,
      name: t.name,
      instrument: t.instrument,
      mp3Path: slot(t.mp3, `track${t.trackIndex + 1}-`),
      source: t.mp3 ? t.source : 'synth',
      volume: t.volume
    }))

    let coverPath: string | null | undefined
    if (form.album) {
      if (form.cover === 'id3' && form.masterMp3 && 'token' in form.masterMp3) {
        const { cover } = await this.id3(this.picked.resolve(form.masterMp3.token))
        if (cover) {
          coverPath = `${this.store.albumDir(form.artist, form.album)}/cover.${coverExtension(cover.mime)}`
          this.store.writeFile(coverPath, cover.data)
          created.push(coverPath)
        }
      } else if (form.cover === 'keep') {
        const sameAlbum =
          before &&
          before.artistName.toLowerCase() === form.artist.toLowerCase() &&
          before.albumTitle?.toLowerCase() === form.album.toLowerCase()
        coverPath = sameAlbum ? before.coverPath : undefined
      }
    }

    const input: SongInput = {
      artist: form.artist,
      album: form.album,
      coverPath,
      title: form.title,
      trackNo: form.trackNo,
      genre: form.genre,
      year: form.year,
      gpPath,
      midiPath,
      masterMp3Path,
      masterSource: masterMp3Path ? form.masterSource : 'synth',
      syncOffsetMs: form.syncOffsetMs,
      durationMs: form.durationMs,
      tracks
    }
    if (!before) return this.repo.createSong(input)

    const { song, orphanedFiles } = this.repo.updateSong(before.id, input)
    for (const f of orphanedFiles) this.safeRemove(f)
    if (before.albumId !== null && before.coverPath && !this.repo.albumExists(before.albumId)) {
      this.safeRemove(before.coverPath)
    }
    if (form.cover === 'none' && before.coverPath && before.albumId !== null) {
      this.repo.clearAlbumCover(before.albumId)
      this.safeRemove(before.coverPath)
    }
    return song
  }

  private rollback(created: string[]): void {
    for (const rel of created.reverse()) {
      if (rel.endsWith('/')) this.safeRemoveDir(rel.slice(0, -1))
      else this.safeRemove(rel)
    }
  }

  private safeRemove(rel: string): void {
    try {
      this.store.remove(rel)
    } catch {
      // best effort: a missing file must not fail the operation
    }
  }

  private safeRemoveDir(rel: string): void {
    try {
      if (existsSync(this.store.resolve(rel))) this.store.removeDirIfEmpty(rel)
    } catch {
      // ignore
    }
  }
}

function validate(form: SongForm): void {
  if (!form.title.trim()) throw new Error('Title is required')
  if (!form.artist.trim()) throw new Error('Artist is required')
  if (!form.gp) throw new Error('A Guitar Pro file is required')
}

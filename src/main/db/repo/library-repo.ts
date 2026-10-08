import type { Db } from '../connection'
import type { AlbumRow, ArtistRow, Song, SongInput, SongTrack } from '@shared/types'

interface SongDbRow {
  id: number
  album_id: number | null
  artist_id: number
  artist_name: string
  album_title: string | null
  cover_path: string | null
  title: string
  track_no: number | null
  genre: string | null
  year: number | null
  gp_path: string
  midi_path: string | null
  master_mp3_path: string | null
  master_source: 'synth' | 'mp3'
  sync_offset_ms: number
  duration_ms: number | null
}

interface TrackDbRow {
  track_index: number
  name: string
  instrument: string | null
  mp3_path: string | null
  source: 'synth' | 'mp3'
  volume: number
}

const SONG_SELECT = `
  SELECT s.*, ar.name AS artist_name, al.title AS album_title, al.cover_path AS cover_path
  FROM song s
  JOIN artist ar ON ar.id = s.artist_id
  LEFT JOIN album al ON al.id = s.album_id`

/** Every library file path (relative) that a song row references. */
export function songFiles(song: Song): string[] {
  return [
    song.gpPath,
    song.midiPath,
    song.masterMp3Path,
    ...song.tracks.map((t) => t.mp3Path)
  ].filter((p): p is string => !!p)
}

export class LibraryRepo {
  constructor(private readonly db: Db) {}

  listArtists(): ArtistRow[] {
    const rows = this.db
      .prepare(
        `SELECT ar.id, ar.name,
                (SELECT COUNT(*) FROM album WHERE artist_id = ar.id) AS albumCount,
                (SELECT COUNT(*) FROM song WHERE artist_id = ar.id) AS songCount
         FROM artist ar ORDER BY ar.name COLLATE NOCASE`
      )
      .all()
    return rows as ArtistRow[]
  }

  listAlbums(artistId: number): AlbumRow[] {
    const rows = this.db
      .prepare(
        `SELECT al.id, al.artist_id AS artistId, al.title, al.year, al.cover_path AS coverPath,
                (SELECT COUNT(*) FROM song WHERE album_id = al.id) AS songCount
         FROM album al WHERE al.artist_id = ? ORDER BY al.year, al.title COLLATE NOCASE`
      )
      .all(artistId)
    return rows as AlbumRow[]
  }

  /** Songs of an album, or the artist's songs that have no album when `albumId` is null. */
  listSongs(artistId: number, albumId: number | null): Song[] {
    const rows = (
      albumId === null
        ? this.db
            .prepare(
              `${SONG_SELECT} WHERE s.artist_id = ? AND s.album_id IS NULL ORDER BY s.title COLLATE NOCASE`
            )
            .all(artistId)
        : this.db
            .prepare(
              `${SONG_SELECT} WHERE s.album_id = ? ORDER BY s.track_no IS NULL, s.track_no, s.title COLLATE NOCASE`
            )
            .all(albumId)
    ) as SongDbRow[]
    return rows.map((r) => this.toSong(r))
  }

  getSong(id: number): Song | undefined {
    const row = this.db.prepare(`${SONG_SELECT} WHERE s.id = ?`).get(id) as SongDbRow | undefined
    return row && this.toSong(row)
  }

  /** Insert a song (creating artist/album as needed) in one transaction. */
  createSong(input: SongInput): Song {
    return this.db.transaction(() => {
      const { artistId, albumId } = this.resolveParents(input)
      const info = this.db
        .prepare(
          `INSERT INTO song (album_id, artist_id, title, track_no, genre, year, gp_path, midi_path,
                             master_mp3_path, master_source, sync_offset_ms, duration_ms)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          albumId,
          artistId,
          input.title,
          input.trackNo ?? null,
          input.genre ?? null,
          input.year ?? null,
          input.gpPath,
          input.midiPath ?? null,
          input.masterMp3Path ?? null,
          input.masterSource ?? 'synth',
          input.syncOffsetMs ?? 0,
          input.durationMs ?? null
        )
      const id = Number(info.lastInsertRowid)
      this.replaceTracks(id, input.tracks ?? [])
      return this.getSong(id) as Song
    })()
  }

  /**
   * Replace a song's fields and tracks. Returns the updated song plus relative file paths that are no
   * longer referenced (so the caller can delete them from the library folder).
   */
  updateSong(id: number, input: SongInput): { song: Song; orphanedFiles: string[] } {
    return this.db.transaction(() => {
      const before = this.getSong(id)
      if (!before) throw new Error(`Song ${id} not found`)
      const { artistId, albumId } = this.resolveParents(input)
      this.db
        .prepare(
          `UPDATE song SET album_id=?, artist_id=?, title=?, track_no=?, genre=?, year=?, gp_path=?,
                  midi_path=?, master_mp3_path=?, master_source=?, sync_offset_ms=?, duration_ms=?,
                  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE id=?`
        )
        .run(
          albumId,
          artistId,
          input.title,
          input.trackNo ?? null,
          input.genre ?? null,
          input.year ?? null,
          input.gpPath,
          input.midiPath ?? null,
          input.masterMp3Path ?? null,
          input.masterSource ?? 'synth',
          input.syncOffsetMs ?? 0,
          input.durationMs ?? null,
          id
        )
      this.replaceTracks(id, input.tracks ?? [])
      this.pruneEmpty()
      const song = this.getSong(id) as Song
      const kept = new Set(songFiles(song))
      return { song, orphanedFiles: songFiles(before).filter((p) => !kept.has(p)) }
    })()
  }

  /** Delete a song and prune empty albums/artists. Returns the song's files for cleanup. */
  deleteSong(id: number): string[] {
    return this.db.transaction(() => {
      const song = this.getSong(id)
      if (!song) return []
      this.db.prepare('DELETE FROM song WHERE id = ?').run(id)
      this.pruneEmpty()
      return songFiles(song)
    })()
  }

  /** Rename an artist, merging into an existing artist of that name if there is one. */
  renameArtist(id: number, name: string): void {
    this.db.transaction(() => {
      const existing = this.db.prepare('SELECT id FROM artist WHERE name = ?').get(name) as
        { id: number } | undefined
      if (!existing || existing.id === id) {
        this.db.prepare('UPDATE artist SET name = ? WHERE id = ?').run(name, id)
        return
      }
      // Merge: move albums (merging same-titled ones) and songs to the existing artist.
      const albums = this.db.prepare('SELECT id, title FROM album WHERE artist_id = ?').all(id) as {
        id: number
        title: string
      }[]
      for (const al of albums) {
        const twin = this.db
          .prepare('SELECT id FROM album WHERE artist_id = ? AND title = ?')
          .get(existing.id, al.title) as { id: number } | undefined
        if (twin) {
          this.db.prepare('UPDATE song SET album_id = ? WHERE album_id = ?').run(twin.id, al.id)
          this.db.prepare('DELETE FROM album WHERE id = ?').run(al.id)
        } else {
          this.db.prepare('UPDATE album SET artist_id = ? WHERE id = ?').run(existing.id, al.id)
        }
      }
      this.db.prepare('UPDATE song SET artist_id = ? WHERE artist_id = ?').run(existing.id, id)
      this.db.prepare('DELETE FROM artist WHERE id = ?').run(id)
    })()
  }

  /** Rename/re-year an album. Throws if the artist already has another album with that title. */
  updateAlbum(id: number, title: string, year: number | null): void {
    const clash = this.db
      .prepare(
        'SELECT 1 FROM album WHERE title = ? AND id != ? AND artist_id = (SELECT artist_id FROM album WHERE id = ?)'
      )
      .get(title, id, id)
    if (clash) throw new Error('This artist already has an album with that title')
    this.db.prepare('UPDATE album SET title = ?, year = ? WHERE id = ?').run(title, year, id)
  }

  clearAlbumCover(albumId: number): void {
    this.db.prepare('UPDATE album SET cover_path = NULL WHERE id = ?').run(albumId)
  }

  albumExists(id: number): boolean {
    return !!this.db.prepare('SELECT 1 FROM album WHERE id = ?').get(id)
  }

  getSetting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    return row ? (JSON.parse(row.value) as T) : undefined
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))
  }

  private resolveParents(input: SongInput): { artistId: number; albumId: number | null } {
    this.db
      .prepare('INSERT INTO artist (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
      .run(input.artist)
    const artist = this.db.prepare('SELECT id FROM artist WHERE name = ?').get(input.artist) as {
      id: number
    }
    if (!input.album) return { artistId: artist.id, albumId: null }
    this.db
      .prepare(
        'INSERT INTO album (artist_id, title, year) VALUES (?,?,?) ON CONFLICT(artist_id, title) DO NOTHING'
      )
      .run(artist.id, input.album, input.albumYear ?? input.year ?? null)
    const album = this.db
      .prepare('SELECT id, cover_path FROM album WHERE artist_id = ? AND title = ?')
      .get(artist.id, input.album) as { id: number; cover_path: string | null }
    if (input.coverPath && input.coverPath !== album.cover_path) {
      this.db.prepare('UPDATE album SET cover_path = ? WHERE id = ?').run(input.coverPath, album.id)
    }
    return { artistId: artist.id, albumId: album.id }
  }

  private replaceTracks(songId: number, tracks: SongTrack[]): void {
    this.db.prepare('DELETE FROM song_track WHERE song_id = ?').run(songId)
    const ins = this.db.prepare(
      `INSERT INTO song_track (song_id, track_index, name, instrument, mp3_path, source, volume)
       VALUES (?,?,?,?,?,?,?)`
    )
    for (const t of tracks)
      ins.run(songId, t.trackIndex, t.name, t.instrument, t.mp3Path, t.source, t.volume)
  }

  private pruneEmpty(): void {
    this.db.exec(`
      DELETE FROM album WHERE id NOT IN (SELECT album_id FROM song WHERE album_id IS NOT NULL);
      DELETE FROM artist WHERE id NOT IN (SELECT artist_id FROM song);`)
  }

  private toSong(r: SongDbRow): Song {
    const tracks = (
      this.db
        .prepare(
          'SELECT track_index, name, instrument, mp3_path, source, volume FROM song_track WHERE song_id = ? ORDER BY track_index'
        )
        .all(r.id) as TrackDbRow[]
    ).map((t) => ({
      trackIndex: t.track_index,
      name: t.name,
      instrument: t.instrument,
      mp3Path: t.mp3_path,
      source: t.source,
      volume: t.volume
    }))
    return {
      id: r.id,
      albumId: r.album_id,
      artistId: r.artist_id,
      artistName: r.artist_name,
      albumTitle: r.album_title,
      coverPath: r.cover_path,
      title: r.title,
      trackNo: r.track_no,
      genre: r.genre,
      year: r.year,
      gpPath: r.gp_path,
      midiPath: r.midi_path,
      masterMp3Path: r.master_mp3_path,
      masterSource: r.master_source,
      syncOffsetMs: r.sync_offset_ms,
      durationMs: r.duration_ms,
      tracks
    }
  }
}

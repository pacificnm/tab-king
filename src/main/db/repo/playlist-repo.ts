import type { PlaylistRow, Song } from '@shared/types'
import type { Db } from '../connection'
import type { LibraryRepo } from './library-repo'

/** Playlists: ordered, each song at most once (NAV-6). */
export class PlaylistRepo {
  constructor(
    private readonly db: Db,
    private readonly library: LibraryRepo
  ) {}

  list(): PlaylistRow[] {
    return this.db
      .prepare(
        `SELECT p.id, p.name, (SELECT COUNT(*) FROM playlist_song WHERE playlist_id = p.id) AS songCount
         FROM playlist p ORDER BY p.name COLLATE NOCASE`
      )
      .all() as PlaylistRow[]
  }

  get(id: number): PlaylistRow | undefined {
    return this.list().find((p) => p.id === id)
  }

  create(name: string): PlaylistRow {
    const clean = name.trim()
    if (!clean) throw new Error('A playlist needs a name')
    try {
      const info = this.db.prepare('INSERT INTO playlist (name) VALUES (?)').run(clean)
      return { id: Number(info.lastInsertRowid), name: clean, songCount: 0 }
    } catch (e) {
      throw duplicateOr(e, clean)
    }
  }

  rename(id: number, name: string): void {
    const clean = name.trim()
    if (!clean) throw new Error('A playlist needs a name')
    try {
      this.db.prepare('UPDATE playlist SET name = ? WHERE id = ?').run(clean, id)
    } catch (e) {
      throw duplicateOr(e, clean)
    }
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM playlist WHERE id = ?').run(id)
  }

  songs(id: number): Song[] {
    const ids = (
      this.db
        .prepare('SELECT song_id AS id FROM playlist_song WHERE playlist_id = ? ORDER BY position')
        .all(id) as { id: number }[]
    ).map((r) => r.id)
    return this.library.getSongs(ids)
  }

  /** Append songs (already-present ones are skipped); returns how many were added. */
  addSongs(id: number, songIds: readonly number[]): number {
    return this.db.transaction(() => {
      const next = this.db.prepare(
        'SELECT COALESCE(MAX(position) + 1, 0) AS n FROM playlist_song WHERE playlist_id = ?'
      )
      let position = (next.get(id) as { n: number }).n
      const ins = this.db.prepare(
        `INSERT OR IGNORE INTO playlist_song (playlist_id, song_id, position)
         SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM song WHERE id = ?)`
      )
      let added = 0
      for (const songId of songIds) {
        if (ins.run(id, songId, position, songId).changes > 0) {
          position++
          added++
        }
      }
      return added
    })()
  }

  removeSong(id: number, songId: number): void {
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT position FROM playlist_song WHERE playlist_id = ? AND song_id = ?')
        .get(id, songId) as { position: number } | undefined
      if (!row) return
      this.db
        .prepare('DELETE FROM playlist_song WHERE playlist_id = ? AND song_id = ?')
        .run(id, songId)
      this.db
        .prepare(
          'UPDATE playlist_song SET position = position - 1 WHERE playlist_id = ? AND position > ?'
        )
        .run(id, row.position)
    })()
  }

  /** Set the order. `songIds` must be exactly the playlist's current songs. */
  reorder(id: number, songIds: readonly number[]): void {
    this.db.transaction(() => {
      const current = (
        this.db
          .prepare('SELECT song_id AS id FROM playlist_song WHERE playlist_id = ?')
          .all(id) as { id: number }[]
      ).map((r) => r.id)
      if (
        songIds.length !== current.length ||
        new Set(songIds).size !== songIds.length ||
        !songIds.every((s) => current.includes(s))
      ) {
        throw new Error('The playlist changed; reload it and try again')
      }
      const upd = this.db.prepare(
        'UPDATE playlist_song SET position = ? WHERE playlist_id = ? AND song_id = ?'
      )
      songIds.forEach((songId, position) => upd.run(position, id, songId))
    })()
  }
}

function duplicateOr(e: unknown, name: string): Error {
  return e instanceof Error && /UNIQUE/.test(e.message)
    ? new Error(`A playlist named "${name}" already exists`)
    : (e as Error)
}

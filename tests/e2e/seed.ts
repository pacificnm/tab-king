import Database from 'better-sqlite3'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { writeGp } from './fixtures'

export interface SeedSong {
  artist: string
  album: string | null
  title: string
  genre?: string
  trackNo?: number
  /** Write a real (short) Guitar Pro file so the song can be played. */
  playable?: boolean
}

/**
 * Add songs straight into the running app's library database (WAL mode lets a second connection write while the app
 * has it open; the FTS triggers fire as usual). Playable songs also get a real GP file in the library folder.
 */
export function seedLibrary(tmp: string, songs: readonly SeedSong[]): number[] {
  const userData = join(tmp, 'ud')
  const db = new Database(join(userData, 'library.db'))
  db.pragma('foreign_keys = ON')
  const artist = db.prepare('INSERT INTO artist (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
  const artistId = db.prepare('SELECT id FROM artist WHERE name = ?')
  const album = db.prepare(
    'INSERT INTO album (artist_id, title) VALUES (?, ?) ON CONFLICT(artist_id, title) DO NOTHING'
  )
  const albumId = db.prepare('SELECT id FROM album WHERE artist_id = ? AND title = ?')
  const insert = db.prepare(
    'INSERT INTO song (album_id, artist_id, title, track_no, genre, gp_path) VALUES (?, ?, ?, ?, ?, ?)'
  )
  let sample: string | null = null
  const ids: number[] = []
  db.transaction(() => {
    for (const s of songs) {
      artist.run(s.artist)
      const a = (artistId.get(s.artist) as { id: number }).id
      let al: number | null = null
      if (s.album) {
        album.run(a, s.album)
        al = (albumId.get(a, s.album) as { id: number }).id
      }
      const rel = `${s.artist}/${s.album ?? '_'}/${s.title}/song.gp`
      ids.push(
        Number(insert.run(al, a, s.title, s.trackNo ?? null, s.genre ?? null, rel).lastInsertRowid)
      )
      if (s.playable) {
        const dest = join(userData, 'library', rel)
        mkdirSync(dirname(dest), { recursive: true })
        sample ??= writeGp(join(userData), 'seed-sample.gp', 2) // 2 bars = 4 s
        copyFileSync(sample, dest)
      }
    }
  })()
  db.close()
  return ids
}

/** Bulk-insert `artists x albums x songs` placeholder songs for scale tests (no files). */
export function seedMany(
  tmp: string,
  artists: number,
  albumsEach: number,
  songsEach: number
): number {
  const db = new Database(join(tmp, 'ud', 'library.db'))
  db.pragma('foreign_keys = ON')
  let count = 0
  db.transaction(() => {
    for (let a = 0; a < artists; a++) {
      const artistId = Number(
        db.prepare('INSERT INTO artist (name) VALUES (?)').run(`Artist ${a} Band`).lastInsertRowid
      )
      for (let al = 0; al < albumsEach; al++) {
        const albumId = Number(
          db
            .prepare('INSERT INTO album (artist_id, title) VALUES (?, ?)')
            .run(artistId, `Album ${al} of ${a}`).lastInsertRowid
        )
        for (let t = 0; t < songsEach; t++) {
          db.prepare(
            'INSERT INTO song (album_id, artist_id, title, track_no, genre, gp_path) VALUES (?,?,?,?,?,?)'
          ).run(
            albumId,
            artistId,
            `Song ${a}-${al}-${t} ${['Rain', 'Fire', 'Road', 'Night', 'Dream'][t % 5]}`,
            t + 1,
            ['Rock', 'Blues', 'Metal'][a % 3],
            `x/${a}/${al}/${t}.gp`
          )
          count++
        }
      }
    }
  })()
  db.close()
  return count
}

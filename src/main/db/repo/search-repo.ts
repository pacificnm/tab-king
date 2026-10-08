import type { AlbumHit, ArtistRow, SearchResults } from '@shared/types'
import type { Db } from '../connection'
import { buildFtsQuery, likePattern, searchTokens } from './search-query'
import type { LibraryRepo } from './library-repo'

const SONG_LIMIT = 50
const GROUP_LIMIT = 20

/** Search over songs (full-text, prefix), albums and artists (substring) — NAV-4, NFR-3. */
export class SearchRepo {
  constructor(
    private readonly db: Db,
    private readonly library: LibraryRepo
  ) {}

  search(text: string): SearchResults {
    const fts = buildFtsQuery(text)
    if (!fts) return { songs: [], albums: [], artists: [] }
    const tokens = searchTokens(text)

    const ids = (
      this.db
        .prepare('SELECT rowid AS id FROM song_fts WHERE song_fts MATCH ? ORDER BY rank LIMIT ?')
        .all(fts, SONG_LIMIT) as { id: number }[]
    ).map((r) => r.id)

    // Every word must appear in the artist name (or, for albums, in the album or artist name).
    const artistWhere = tokens.map(() => "ar.name LIKE ? ESCAPE '\\'").join(' AND ')
    const albumWhere = tokens
      .map(() => "(al.title LIKE ? ESCAPE '\\' OR ar.name LIKE ? ESCAPE '\\')")
      .join(' AND ')
    const patterns = tokens.map(likePattern)

    const artists = this.db
      .prepare(
        `SELECT ar.id, ar.name,
                (SELECT COUNT(*) FROM album WHERE artist_id = ar.id) AS albumCount,
                (SELECT COUNT(*) FROM song WHERE artist_id = ar.id) AS songCount
         FROM artist ar WHERE ${artistWhere} ORDER BY ar.name COLLATE NOCASE LIMIT ?`
      )
      .all(...patterns, GROUP_LIMIT) as ArtistRow[]

    const albums = this.db
      .prepare(
        `SELECT al.id, al.artist_id AS artistId, al.title, al.year, al.cover_path AS coverPath,
                (SELECT COUNT(*) FROM song WHERE album_id = al.id) AS songCount,
                ar.name AS artistName
         FROM album al JOIN artist ar ON ar.id = al.artist_id
         WHERE ${albumWhere} ORDER BY al.title COLLATE NOCASE LIMIT ?`
      )
      .all(...patterns.flatMap((p) => [p, p]), GROUP_LIMIT) as AlbumHit[]

    return { songs: this.library.getSongs(ids), albums, artists }
  }
}

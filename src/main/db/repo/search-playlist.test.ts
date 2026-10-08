import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SongInput } from '@shared/types'
import { openDatabase, type Db } from '../connection'
import { loadMigrations, migrate } from '../migrate'
import { LibraryRepo } from './library-repo'
import { PlaylistRepo } from './playlist-repo'
import { SearchRepo } from './search-repo'

let db: Db
let lib: LibraryRepo
let search: SearchRepo
let lists: PlaylistRepo

const song = (artist: string, album: string | null, title: string, genre?: string): SongInput => ({
  artist,
  album,
  title,
  genre: genre ?? null,
  gpPath: `${artist}/${title}.gp`
})
const add = (...inputs: SongInput[]): number[] => inputs.map((i) => lib.createSong(i).id)
const titles = (text: string): string[] => search.search(text).songs.map((s) => s.title)

beforeEach(() => {
  db = openDatabase(':memory:')
  lib = new LibraryRepo(db)
  search = new SearchRepo(db, lib)
  lists = new PlaylistRepo(db, lib)
})

describe('full-text search (NAV-4)', () => {
  beforeEach(() => {
    add(
      song('Rush', 'Moving Pictures', 'Tom Sawyer', 'Progressive rock'),
      song('Rush', 'Moving Pictures', 'YYZ'),
      song('Rush', 'Signals', 'Subdivisions'),
      song('Yes', 'Fragile', 'Roundabout', 'Progressive rock'),
      song('Mötley Crüe', 'Dr. Feelgood', 'Kickstart My Heart')
    )
  })

  it('finds songs by title, artist, album and genre, with prefixes and any word order', () => {
    expect(titles('tom saw')).toEqual(['Tom Sawyer'])
    expect(titles('sawyer tom')).toEqual(['Tom Sawyer'])
    expect(titles('moving pict').sort()).toEqual(['Tom Sawyer', 'YYZ'])
    expect(titles('rush').sort()).toEqual(['Subdivisions', 'Tom Sawyer', 'YYZ'])
    expect(titles('progressive').sort()).toEqual(['Roundabout', 'Tom Sawyer'])
    expect(titles('rush progressive')).toEqual(['Tom Sawyer'])
    expect(titles('zzz')).toEqual([])
  })

  it('ignores case and accents', () => {
    expect(titles('MOTLEY')).toEqual(['Kickstart My Heart'])
    expect(titles('crue')).toEqual(['Kickstart My Heart'])
    expect(titles('mötley')).toEqual(['Kickstart My Heart'])
  })

  it('groups albums and artists, matching on any word of artist + album', () => {
    const r = search.search('rush')
    expect(r.artists.map((a) => a.name)).toEqual(['Rush'])
    expect(r.artists[0]).toMatchObject({ songCount: 3, albumCount: 2 })
    expect(r.albums.map((a) => a.title).sort()).toEqual(['Moving Pictures', 'Signals'])
    expect(r.albums[0]?.artistName).toBe('Rush')
    expect(search.search('fragile yes').albums.map((a) => a.title)).toEqual(['Fragile'])
    expect(search.search('moving').artists).toEqual([])
  })

  it('treats punctuation and LIKE wildcards literally and never throws', () => {
    for (const q of ['', '  ', '"', "'", '%', '_', 'a" OR "b', '(', '*', 'NEAR(', '\\']) {
      expect(() => search.search(q)).not.toThrow()
    }
    expect(search.search('%').artists).toEqual([])
    expect(search.search('').songs).toEqual([])
  })

  it('stays in sync when songs change (insert, edit, delete)', () => {
    const [id] = add(song('Pink Floyd', 'The Wall', 'Comfortably Numb'))
    expect(titles('numb')).toEqual(['Comfortably Numb'])
    lib.updateSong(id!, { ...song('Pink Floyd', 'The Wall', 'Hey You') })
    expect(titles('numb')).toEqual([])
    expect(titles('hey')).toEqual(['Hey You'])
    lib.deleteSong(id!)
    expect(titles('hey')).toEqual([])
    expect(db.prepare('SELECT COUNT(*) c FROM song_fts').get()).toEqual({ c: 5 })
  })

  it('stays in sync when an artist or album is renamed, or artists merge', () => {
    const rush = lib.listArtists().find((a) => a.name === 'Rush')!
    lib.renameArtist(rush.id, 'Rush (Canada)')
    expect(titles('canada').sort()).toEqual(['Subdivisions', 'Tom Sawyer', 'YYZ'])

    const album = lib.listAlbums(rush.id).find((a) => a.title === 'Signals')!
    lib.updateAlbum(album.id, 'Signals Deluxe', 1982)
    expect(titles('deluxe')).toEqual(['Subdivisions'])
    expect(titles('signals')).toEqual(['Subdivisions'])

    lib.renameArtist(rush.id, 'Yes') // merge into an existing artist
    expect(titles('yes').sort()).toEqual(['Roundabout', 'Subdivisions', 'Tom Sawyer', 'YYZ'])
    expect(titles('canada')).toEqual([])
  })

  it('indexes songs that already existed when the migration ran (upgrade from v0.5)', () => {
    const sql = (n: string): string => readFileSync(join(__dirname, '../migrations', n), 'utf8')
    const files = {
      './001_init.sql': sql('001_init.sql'),
      './002_track_mix.sql': sql('002_track_mix.sql')
    }
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    migrate(old, loadMigrations(files))
    old.exec(`INSERT INTO artist(name) VALUES ('Old Band');
              INSERT INTO album(artist_id,title) VALUES (1,'Vintage');
              INSERT INTO song(artist_id,album_id,title,genre,gp_path) VALUES (1,1,'Legacy Song','Blues','a.gp');
              INSERT INTO song(artist_id,title,gp_path) VALUES (1,'Loose Song','b.gp')`)
    migrate(old, loadMigrations({ ...files, './003_search.sql': sql('003_search.sql') }))
    const found = (q: string): string[] =>
      new SearchRepo(old, new LibraryRepo(old))
        .search(q)
        .songs.map((x) => x.title)
        .sort()
    expect(found('legacy')).toEqual(['Legacy Song'])
    expect(found('vintage')).toEqual(['Legacy Song'])
    expect(found('blues')).toEqual(['Legacy Song'])
    expect(found('old band')).toEqual(['Legacy Song', 'Loose Song'])
    old.close()
  })
})

describe('favorites (NAV-5)', () => {
  it('toggles and lists most recent first', () => {
    const [a, b, c] = add(song('X', null, 'A'), song('X', null, 'B'), song('X', null, 'C'))
    expect(lib.getSong(a!)?.favorite).toBe(false)
    lib.setFavorite(a!, true)
    lib.setFavorite(b!, true)
    lib.setFavorite(a!, true) // idempotent
    expect(lib.listFavorites().map((s) => s.title)).toEqual(['B', 'A'])
    expect(lib.getSong(a!)?.favorite).toBe(true)
    expect(lib.getSong(c!)?.favorite).toBe(false)
    lib.setFavorite(b!, false)
    expect(lib.listFavorites().map((s) => s.title)).toEqual(['A'])
  })

  it('flags favorites in search results, and removes them with the song', () => {
    const [a] = add(song('X', null, 'Findable'))
    lib.setFavorite(a!, true)
    expect(search.search('findable').songs[0]?.favorite).toBe(true)
    lib.deleteSong(a!)
    expect(lib.listFavorites()).toEqual([])
  })
})

describe('playlists (NAV-6)', () => {
  let ids: number[]
  beforeEach(() => {
    ids = add(
      song('X', null, 'One'),
      song('X', null, 'Two'),
      song('X', null, 'Three'),
      song('X', null, 'Four')
    )
  })
  const order = (id: number): string[] => lists.songs(id).map((s) => s.title)

  it('creates, renames and deletes, rejecting empty and duplicate names', () => {
    const p = lists.create('  Warmups ')
    expect(p).toMatchObject({ name: 'Warmups', songCount: 0 })
    expect(() => lists.create('warmups')).toThrow(/already exists/)
    expect(() => lists.create('   ')).toThrow(/needs a name/)
    const q = lists.create('Gigs')
    expect(() => lists.rename(q.id, 'WARMUPS')).toThrow(/already exists/)
    lists.rename(q.id, 'Gig set')
    expect(lists.list().map((x) => x.name)).toEqual(['Gig set', 'Warmups'])
    lists.delete(p.id)
    expect(lists.list().map((x) => x.name)).toEqual(['Gig set'])
  })

  it('appends songs in order, skips duplicates and unknown songs', () => {
    const p = lists.create('P')
    expect(lists.addSongs(p.id, [ids[2]!, ids[0]!])).toBe(2)
    expect(lists.addSongs(p.id, [ids[0]!, ids[3]!, 99999])).toBe(1)
    expect(order(p.id)).toEqual(['Three', 'One', 'Four'])
    expect(lists.get(p.id)?.songCount).toBe(3)
  })

  it('removes a song and keeps the rest in order', () => {
    const p = lists.create('P')
    lists.addSongs(p.id, ids)
    lists.removeSong(p.id, ids[1]!)
    expect(order(p.id)).toEqual(['One', 'Three', 'Four'])
    lists.addSongs(p.id, [ids[1]!])
    expect(order(p.id)).toEqual(['One', 'Three', 'Four', 'Two'])
    lists.removeSong(p.id, 12345) // not in the list: no-op
  })

  it('reorders, and refuses a list that is not exactly the current songs', () => {
    const p = lists.create('P')
    lists.addSongs(p.id, ids)
    lists.reorder(p.id, [ids[3]!, ids[2]!, ids[1]!, ids[0]!])
    expect(order(p.id)).toEqual(['Four', 'Three', 'Two', 'One'])
    expect(() => lists.reorder(p.id, [ids[0]!])).toThrow(/changed/)
    expect(() => lists.reorder(p.id, [ids[0]!, ids[0]!, ids[1]!, ids[2]!])).toThrow(/changed/)
    expect(() => lists.reorder(p.id, [...ids.slice(0, 3), 777])).toThrow(/changed/)
    expect(order(p.id)).toEqual(['Four', 'Three', 'Two', 'One'])
  })

  it('drops deleted songs and deleted playlists cleanly', () => {
    const p = lists.create('P')
    lists.addSongs(p.id, ids)
    lib.deleteSong(ids[0]!)
    expect(order(p.id)).toEqual(['Two', 'Three', 'Four'])
    lists.delete(p.id)
    expect(db.prepare('SELECT COUNT(*) c FROM playlist_song').get()).toEqual({ c: 0 })
    expect(lib.listSongsByArtist(lib.listArtists()[0]!.id)).toHaveLength(3)
  })
})

describe('listSongsByArtist', () => {
  it('orders by album year, then track, with album-less songs last', () => {
    lib.createSong({ ...song('A', 'Late', 'L1'), albumYear: 2000, trackNo: 1 })
    lib.createSong({ ...song('A', 'Early', 'E2'), albumYear: 1990, trackNo: 2 })
    lib.createSong({ ...song('A', 'Early', 'E1'), albumYear: 1990, trackNo: 1 })
    lib.createSong(song('A', null, 'Loose'))
    expect(lib.listSongsByArtist(lib.listArtists()[0]!.id).map((s) => s.title)).toEqual([
      'E1',
      'E2',
      'L1',
      'Loose'
    ])
  })
})

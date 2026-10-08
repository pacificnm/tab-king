import { beforeAll, describe, expect, it } from 'vitest'
import { openDatabase } from '../connection'
import { LibraryRepo } from './library-repo'
import { PlaylistRepo } from './playlist-repo'
import { SearchRepo } from './search-repo'

/**
 * NFR-3: with 5,000 songs the tree and search respond in under 200 ms. The queries are all indexed or FTS-backed and
 * measured at the repository layer (the UI adds virtualization on top); the budget here is the requirement itself,
 * so a slow CI machine still has a wide margin over the typical few-millisecond results.
 */
const BUDGET_MS = 200
const SONGS = 5000

let lib: LibraryRepo
let search: SearchRepo
let lists: PlaylistRepo

/** Run `fn` three times and judge the fastest: scheduler and GC noise on shared CI machines only ever adds time. */
function timed<T>(label: string, fn: () => T): T {
  let best = Infinity
  let result!: T
  for (let i = 0; i < 3; i++) {
    const start = performance.now()
    result = fn()
    best = Math.min(best, performance.now() - start)
  }
  console.log(`${label}: ${best.toFixed(1)} ms (best of 3)`)
  expect(best, label).toBeLessThan(BUDGET_MS)
  return result
}

beforeAll(() => {
  const db = openDatabase(':memory:')
  lib = new LibraryRepo(db)
  search = new SearchRepo(db, lib)
  lists = new PlaylistRepo(db, lib)
  // 500 artists x 2 albums x 5 songs
  db.transaction(() => {
    for (let a = 0; a < 500; a++) {
      for (let al = 0; al < 2; al++) {
        for (let t = 0; t < 5; t++) {
          lib.createSong({
            artist: `Artist ${a} Band`,
            album: `Album ${al} of ${a}`,
            title: `Song ${a}-${al}-${t} ${['Rain', 'Fire', 'Road', 'Night', 'Dream'][t]}`,
            genre: ['Rock', 'Blues', 'Metal'][a % 3],
            gpPath: `x/${a}/${al}/${t}.gp`,
            trackNo: t + 1,
            tracks: [
              {
                trackIndex: 0,
                name: 'Lead',
                instrument: 'Guitar',
                mp3Path: null,
                source: 'synth',
                volume: 1,
                muted: false,
                solo: false
              },
              {
                trackIndex: 1,
                name: 'Bass',
                instrument: 'Bass',
                mp3Path: null,
                source: 'synth',
                volume: 1,
                muted: false,
                solo: false
              }
            ]
          })
        }
      }
    }
  })()
})

describe(`library at ${SONGS} songs (NFR-3)`, () => {
  it('has the expected size', () => {
    expect(lib.listArtists()).toHaveLength(500)
    expect(lib.listArtists().reduce((n, a) => n + a.songCount, 0)).toBe(SONGS)
  })

  it('opens the Artists tree quickly', () => {
    const artists = timed('listArtists', () => lib.listArtists())
    const albums = timed('listAlbums', () => lib.listAlbums(artists[250]!.id))
    const songs = timed('listSongs', () => lib.listSongs(artists[250]!.id, albums[0]!.id))
    expect(songs).toHaveLength(5)
    expect(timed('listSongsByArtist', () => lib.listSongsByArtist(artists[250]!.id))).toHaveLength(
      10
    )
  })

  it('searches as you type', () => {
    for (const q of [
      'a',
      'ar',
      'artist',
      'artist 42',
      'song 4',
      'rain',
      'blues',
      'album 1 of 3',
      'zzz'
    ]) {
      const r = timed(`search "${q}"`, () => search.search(q))
      if (q === 'zzz') expect(r.songs).toEqual([])
      else expect(r.songs.length + r.albums.length + r.artists.length).toBeGreaterThan(0)
    }
    expect(search.search('rain').songs).toHaveLength(50) // capped
  })

  it('lists large favorites and playlists quickly', () => {
    const all = lib.listArtists().flatMap((a) => lib.listSongsByArtist(a.id).slice(0, 4))
    for (const s of all.slice(0, 1000)) lib.setFavorite(s.id, true)
    expect(timed('listFavorites (1000)', () => lib.listFavorites())).toHaveLength(1000)
    const p = lists.create('Big')
    lists.addSongs(
      p.id,
      all.slice(0, 1000).map((s) => s.id)
    )
    expect(timed('playlist songs (1000)', () => lists.songs(p.id))).toHaveLength(1000)
    timed('reorder (1000)', () =>
      lists.reorder(
        p.id,
        all
          .slice(0, 1000)
          .map((s) => s.id)
          .reverse()
      )
    )
  })
})

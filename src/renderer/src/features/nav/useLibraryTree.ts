import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildRows,
  emptyData,
  songsKey,
  type Expanded,
  type TreeData,
  type TreeRow
} from './tree-model'

const toggle = <T>(set: ReadonlySet<T>, v: T): Set<T> => {
  const next = new Set(set)
  if (!next.delete(v)) next.add(v)
  return next
}

/** Lazy-loaded Play Lists and Artist → Album → Song tree state, refreshed whenever the library changes (NAV-2). */
export function useLibraryTree(): {
  rows: TreeRow[]
  toggleArtists: () => void
  togglePlaylists: () => void
  toggleArtist: (artistId: number) => void
  toggleAlbum: (artistId: number, albumId: number) => void
  collapse: (row: TreeRow) => boolean
} {
  const [data, setData] = useState<TreeData>(emptyData)
  const [artistsOpen, setArtistsOpen] = useState(false)
  const [playlistsOpen, setPlaylistsOpen] = useState(false)
  const [artistIds, setArtistIds] = useState<ReadonlySet<number>>(new Set())
  const [songGroups, setSongGroups] = useState<ReadonlySet<string>>(new Set())
  const [version, setVersion] = useState(0)
  const dataRef = useRef(data)
  const fetchedVersion = useRef(-1)

  useEffect(() => window.api.library.onChanged(() => setVersion((v) => v + 1)), [])

  // Fetch whatever the current expansion is missing; after a library change refetch everything expanded.
  useEffect(() => {
    if (!artistsOpen && !playlistsOpen) return
    let cancelled = false
    const force = fetchedVersion.current !== version
    const base = force ? emptyData() : dataRef.current
    void (async () => {
      const lib = window.api.library
      const jobs: Promise<void>[] = []
      let artists = base.artists
      let playlists = base.playlists
      if (artistsOpen && !artists) jobs.push(lib.listArtists().then((a) => void (artists = a)))
      if (playlistsOpen && !playlists) {
        jobs.push(lib.playlists.list().then((p) => void (playlists = p)))
      }
      const albums = { ...base.albums }
      const songs = { ...base.songs }
      if (artistsOpen) {
        for (const id of artistIds) {
          if (!albums[id]) jobs.push(lib.listAlbums(id).then((a) => void (albums[id] = a)))
          const none = songsKey(id, null)
          if (!songs[none]) jobs.push(lib.listSongs(id, null).then((s) => void (songs[none] = s)))
        }
        for (const key of songGroups) {
          if (songs[key]) continue
          const [artistId, albumId] = key.split(':')
          jobs.push(
            lib.listSongs(Number(artistId), Number(albumId)).then((s) => void (songs[key] = s))
          )
        }
      }
      await Promise.all(jobs)
      if (cancelled) return
      fetchedVersion.current = version
      dataRef.current = { artists, playlists, albums, songs }
      setData(dataRef.current)
    })()
    return () => {
      cancelled = true
    }
  }, [artistsOpen, playlistsOpen, artistIds, songGroups, version])

  const expanded: Expanded = useMemo(
    () => ({ artists: artistsOpen, playlists: playlistsOpen, artistIds, songGroups }),
    [artistsOpen, playlistsOpen, artistIds, songGroups]
  )
  const rows = useMemo(() => buildRows(data, expanded), [data, expanded])

  const collapse = useCallback(
    (row: TreeRow): boolean => {
      if (row.kind === 'nav' && row.id === 'artists' && artistsOpen) setArtistsOpen(false)
      else if (row.kind === 'nav' && row.id === 'playlists' && playlistsOpen)
        setPlaylistsOpen(false)
      else if (row.kind === 'artist' && row.expanded) setArtistIds((s) => toggle(s, row.artist.id))
      else if (row.kind === 'album' && row.expanded)
        setSongGroups((s) => toggle(s, songsKey(row.artist.id, row.album.id)))
      else return false
      return true
    },
    [artistsOpen, playlistsOpen]
  )

  return {
    rows,
    toggleArtists: () => setArtistsOpen((o) => !o),
    togglePlaylists: () => setPlaylistsOpen((o) => !o),
    toggleArtist: (id) => setArtistIds((s) => toggle(s, id)),
    toggleAlbum: (artistId, albumId) =>
      setSongGroups((s) => toggle(s, songsKey(artistId, albumId))),
    collapse
  }
}

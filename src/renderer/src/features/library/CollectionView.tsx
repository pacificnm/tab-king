import { Cover } from '../../components/Cover'
import { btnPrimary } from '../../components/Modal'
import { useLibraryData } from '../../hooks/useLibraryData'
import { useLibraryActions } from './LibraryContext'
import { SongList } from './SongList'
import { ViewHeader } from './ViewHeader'

export type Collection =
  | { kind: 'album'; id: number; artistId: number; title: string }
  | { kind: 'artist'; id: number; name: string }

/** All songs of an album, or of an artist, reached from search results. */
export function CollectionView({ collection }: { collection: Collection }): React.JSX.Element {
  const actions = useLibraryActions()
  const key = `${collection.kind}:${collection.id}`
  const songs = useLibraryData(
    () =>
      collection.kind === 'album'
        ? window.api.library.listSongs(collection.artistId, collection.id)
        : window.api.library.listSongsByArtist(collection.id),
    key
  )
  const title = collection.kind === 'album' ? collection.title : collection.name
  const subtitle =
    collection.kind === 'album'
      ? songs?.[0]?.artistName
      : songs
        ? `${songs.length} songs`
        : undefined
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ViewHeader
        title={title}
        subtitle={subtitle}
        lead={
          collection.kind === 'album' ? (
            <Cover src={songs?.[0]?.coverPath ?? null} size={64} />
          ) : undefined
        }
      >
        <button
          type="button"
          className={btnPrimary}
          disabled={!songs || songs.length === 0}
          onClick={() => songs && actions.playQueue(songs, 0, title)}
        >
          Play
        </button>
      </ViewHeader>
      <div className="min-h-0 flex-1">
        {songs === null ? (
          <p className="p-6 text-fg-muted">Loading…</p>
        ) : songs.length === 0 ? (
          <p className="p-6 text-fg-muted">There are no songs here any more.</p>
        ) : (
          <SongList songs={songs} label={title} />
        )}
      </div>
    </div>
  )
}

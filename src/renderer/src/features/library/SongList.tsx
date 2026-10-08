import { List, type RowComponentProps } from 'react-window'
import type { Song } from '@shared/types'
import { SongRow } from './SongRow'

const ROW_HEIGHT = 56

interface RowProps {
  songs: readonly Song[]
  label: string
}

function Row({
  index,
  style,
  songs,
  label
}: RowComponentProps<RowProps>): React.JSX.Element | null {
  const song = songs[index]
  return song ? (
    <SongRow song={song} index={index} queue={songs} queueLabel={label} style={style} />
  ) : null
}

/** A long list of songs, virtualized (favorites, an artist's songs...). Fills its parent's height. */
export function SongList({
  songs,
  label
}: RowProps & { songs: readonly Song[] }): React.JSX.Element {
  return (
    <List
      role="list"
      aria-label={label}
      rowComponent={Row}
      rowCount={songs.length}
      rowHeight={ROW_HEIGHT}
      rowProps={{ songs, label }}
      style={{ height: '100%' }}
    />
  )
}

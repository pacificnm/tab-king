import type { Id3Info } from '@shared/types'

export interface Id3Result {
  info: Omit<Id3Info, 'coverDataUrl'>
  cover: { mime: string; data: Uint8Array } | null
}

/** Read ID3/container tags and embedded cover art from an audio file. Throws on unreadable files. */
export async function readId3(file: string): Promise<Id3Result> {
  const { parseFile, selectCover } = await import('music-metadata')
  const meta = await parseFile(file, { duration: true })
  const c = meta.common
  const pic = selectCover(c.picture)
  return {
    info: {
      title: c.title ?? null,
      artist: c.artist ?? c.albumartist ?? null,
      album: c.album ?? null,
      year: c.year ?? null,
      trackNo: c.track.no ?? null,
      genre: c.genre?.[0] ?? null,
      durationMs: meta.format.duration ? Math.round(meta.format.duration * 1000) : null
    },
    cover: pic ? { mime: pic.format, data: pic.data } : null
  }
}

export function coverExtension(mime: string): string {
  if (/png/i.test(mime)) return 'png'
  if (/webp/i.test(mime)) return 'webp'
  if (/gif/i.test(mime)) return 'gif'
  return 'jpg'
}

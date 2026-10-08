import { protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { resolveWithin, type LibraryStore } from './store'

export const SCHEME = 'tabking'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.sf3': 'application/octet-stream',
  '.sf2': 'application/octet-stream',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json'
}

/** Must run before `app.ready`. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

export type MediaHost = 'library' | 'app' | 'soundfonts'

/**
 * Parse `tabking://library/<relpath>` (user files), `tabking://app/<relpath>` (bundled assets) or
 * `tabking://soundfonts/<name>` (the user's SoundFonts); null if invalid.
 */
export function parseMediaUrl(url: string): { host: MediaHost; rel: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${SCHEME}:` || !['library', 'app', 'soundfonts'].includes(u.hostname))
    return null
  try {
    const segs = u.pathname.split('/').slice(1).map(decodeURIComponent)
    if (segs.some((s) => s === '' || s === '.' || s === '..' || /[\\/\0]/.test(s))) return null
    return { host: u.hostname as MediaHost, rel: segs.join('/') }
  } catch {
    return null
  }
}

/** Only these bundled-resource folders may be read through the `app` host. */
const APP_ALLOWED_PREFIXES = ['soundfont/', 'font/', 'help/']

/** Parse a single `bytes=a-b` Range header against a file size. Null = unsatisfiable/invalid. */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    start = Math.max(size - suffix, 0)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start >= size || start > end) return null
  return { start, end }
}

export function registerLibraryProtocol(
  store: LibraryStore,
  resourcesDir: string,
  soundfontsDir: string
): void {
  protocol.handle(SCHEME, (request) => {
    const parsed = parseMediaUrl(request.url)
    if (!parsed) return new Response('Bad request', { status: 400 })
    if (parsed.host === 'app' && !APP_ALLOWED_PREFIXES.some((p) => parsed.rel.startsWith(p))) {
      return new Response('Forbidden', { status: 403 })
    }
    let abs: string
    let size: number
    try {
      abs =
        parsed.host === 'app'
          ? resolveWithin(resourcesDir, parsed.rel)
          : parsed.host === 'soundfonts'
            ? resolveWithin(soundfontsDir, parsed.rel)
            : store.resolve(parsed.rel)
      const st = statSync(abs)
      if (!st.isFile()) return new Response('Not found', { status: 404 })
      size = st.size
    } catch {
      return new Response('Not found', { status: 404 })
    }
    const headers: Record<string, string> = {
      // The page is served from file:// (or the dev server), a different origin from tabking://.
      'Access-Control-Allow-Origin': '*',
      'Content-Type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes'
    }
    const rangeHeader = request.headers.get('range')
    const range = rangeHeader ? parseRange(rangeHeader, size) : null
    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Range': `bytes */${size}` }
      })
    }
    const start = range?.start ?? 0
    const end = range?.end ?? size - 1
    if (size === 0)
      return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': '0' } })
    const body = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        ...headers,
        'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  })
}

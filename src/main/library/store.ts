import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Make a string safe as a single path segment on every platform. */
export function sanitizeSegment(name: string, fallback = 'Unknown'): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we strip
  let s = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  s = s.replace(/^\.+/, '').replace(/[. ]+$/, '')
  if (s.length > 80) s = s.slice(0, 80).trim()
  if (!s || WINDOWS_RESERVED.test(s)) return s ? `${s}_` : fallback
  return s
}

/** Resolve a relative POSIX path under `root`; throws if it is empty, has dot/empty segments or escapes. */
export function resolveWithin(root: string, rel: string): string {
  const segs = rel.split('/')
  if (segs.some((s) => s === '' || s === '.' || s === '..' || s.includes('\\'))) {
    throw new Error('Path outside library')
  }
  const abs = resolve(root, ...segs)
  const back = relative(root, abs)
  if (back === '' || back.startsWith('..') || resolve(back) === back)
    throw new Error('Path outside library')
  return abs
}

/** Managed library folder: all song files live under `root`; callers deal in relative POSIX paths. */
export class LibraryStore {
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true })
  }

  /** Absolute path for a relative one; throws if it would escape the library folder. */
  resolve(rel: string): string {
    return resolveWithin(this.root, rel)
  }

  exists(rel: string): boolean {
    try {
      return existsSync(this.resolve(rel))
    } catch {
      return false
    }
  }

  /** Reserve a fresh `<Artist>/<Album>/<Title>` folder, adding " (2)" etc. on collision. Returns the relative path. */
  allocateSongDir(artist: string, album: string | null, title: string): string {
    const parent = [sanitizeSegment(artist), ...(album ? [sanitizeSegment(album)] : [])].join('/')
    const leaf = sanitizeSegment(title, 'Untitled')
    for (let n = 1; ; n++) {
      const rel = `${parent}/${n === 1 ? leaf : `${leaf} (${n})`}`
      if (!existsSync(this.resolve(rel))) {
        mkdirSync(this.resolve(rel), { recursive: true })
        return rel
      }
    }
  }

  albumDir(artist: string, album: string): string {
    return `${sanitizeSegment(artist)}/${sanitizeSegment(album)}`
  }

  /** Copy an external file into `relDir`, never overwriting. Returns the new relative path. */
  copyIn(srcAbs: string, relDir: string, prefix = ''): string {
    const ext = extname(srcAbs)
    const stem = sanitizeSegment(prefix + basename(srcAbs, ext), 'file')
    for (let n = 1; ; n++) {
      const rel = `${relDir}/${stem}${n === 1 ? '' : ` (${n})`}${ext}`
      const dest = this.resolve(rel)
      if (!existsSync(dest)) {
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(srcAbs, dest)
        return rel
      }
    }
  }

  writeFile(rel: string, data: Uint8Array): void {
    const abs = this.resolve(rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, data)
  }

  /** Remove a file, then any parent folders left empty (up to, not including, the root). */
  remove(rel: string): void {
    const abs = this.resolve(rel)
    rmSync(abs, { force: true })
    this.pruneEmptyDirs(dirname(abs))
  }

  /** Remove `rel` if it is an empty directory, then prune empty parents. */
  removeDirIfEmpty(rel: string): void {
    const abs = this.resolve(rel)
    if (readdirSync(abs).length === 0) {
      rmdirSync(abs)
      this.pruneEmptyDirs(dirname(abs))
    }
  }

  private pruneEmptyDirs(dirAbs: string): void {
    let dir = dirAbs
    while (dir !== this.root && dir.startsWith(this.root + sep)) {
      try {
        if (readdirSync(dir).length > 0) return
        rmdirSync(dir)
      } catch {
        return
      }
      dir = dirname(dir)
    }
  }
}

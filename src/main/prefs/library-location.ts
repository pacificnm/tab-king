import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

/** Dropped into a folder Tab King manages, so we never adopt (or later delete from) a folder that holds other things. */
export const MARKER = '.tabking-library'

export interface Scan {
  /** Library-relative POSIX paths of every regular file (the marker excluded). */
  files: string[]
  bytes: number
}

export function ensureMarker(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const marker = join(dir, MARKER)
  if (!existsSync(marker)) writeFileSync(marker, 'This folder is managed by Tab King.\n')
}

export function scanFiles(root: string): Scan {
  const files: string[] = []
  let bytes = 0
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(next)
      else if (e.isFile() && next !== MARKER) {
        files.push(next)
        bytes += statSync(join(root, next)).size
      }
    }
  }
  if (existsSync(root)) walk('')
  return { files, bytes }
}

const fold = (p: string): string =>
  process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p

const inside = (parent: string, child: string): boolean => {
  const rel = relative(fold(resolve(parent)), fold(resolve(child)))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export type TargetCheck = { mode: 'empty' | 'existing' } | { error: string }

/** Can `target` become the library folder (PRF-2)? It must be new or empty, or already a Tab King library. */
export function checkTarget(current: string, target: string): TargetCheck {
  if (!isAbsolute(target)) return { error: 'Choose a full folder path.' }
  if (fold(resolve(target)) === fold(resolve(current)))
    return { error: 'That is already the library folder.' }
  if (inside(current, target)) return { error: 'Choose a folder outside the current library.' }
  if (inside(target, current))
    return { error: 'Choose a folder that does not contain the current library.' }
  if (!existsSync(target)) return { mode: 'empty' }
  if (!statSync(target).isDirectory()) return { error: 'That path is a file, not a folder.' }
  if (existsSync(join(target, MARKER))) return { mode: 'existing' }
  if (readdirSync(target).length === 0) return { mode: 'empty' }
  return {
    error:
      'That folder is not empty. Choose an empty folder (or a new one) so Tab King can manage it safely.'
  }
}

/**
 * Copy `files` from `from` into `to`, verifying sizes. On any failure everything copied so far is removed again and the
 * error is rethrown, so the old library is never touched and the target is left as it was.
 */
export async function copyLibrary(
  from: string,
  to: string,
  files: readonly string[],
  onProgress: (done: number) => void
): Promise<void> {
  const created: string[] = []
  const madeDirs: string[] = []
  try {
    if (!existsSync(to)) {
      mkdirSync(to, { recursive: true })
      madeDirs.push(to)
    }
    ensureMarker(to)
    let done = 0
    for (const rel of files) {
      const src = join(from, ...rel.split('/'))
      const dest = join(to, ...rel.split('/'))
      mkdirSync(dirname(dest), { recursive: true })
      await copyFile(src, dest, 1 /* COPYFILE_EXCL: never overwrite */)
      created.push(dest)
      if (statSync(dest).size !== statSync(src).size)
        throw new Error(`Copy of ${rel} is incomplete`)
      onProgress(++done)
    }
  } catch (e) {
    for (const f of created) rmSync(f, { force: true })
    rmSync(join(to, MARKER), { force: true })
    pruneEmpty(to, true)
    for (const d of madeDirs) if (existsSync(d) && readdirSync(d).length === 0) rmdirSync(d)
    throw e
  }
}

/** Remove now-empty sub-folders under `root` (and `root` itself unless `keepRoot`). */
function pruneEmpty(root: string, keepRoot = false): void {
  if (!existsSync(root)) return
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory()) pruneEmpty(join(root, e.name))
  }
  if (!keepRoot && readdirSync(root).length === 0) rmdirSync(root)
}

/**
 * Delete the copied `files` from the old library and tidy up. Only those files are touched, plus the marker and folders
 * left empty, so anything else the user keeps there survives.
 */
export function removeCopied(root: string, files: readonly string[]): number {
  let removed = 0
  for (const rel of files) {
    const abs = join(root, ...rel.split('/'))
    if (existsSync(abs)) {
      unlinkSync(abs)
      removed++
    }
  }
  rmSync(join(root, MARKER), { force: true })
  pruneEmpty(root)
  return removed
}

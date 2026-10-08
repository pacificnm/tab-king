import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, isAbsolute } from 'node:path'
import yazl from 'yazl'
import type { BackupManifest, BackupResult } from '@shared/types'
import { schemaVersion, type Db } from '../db/connection'
import { scanFiles } from '../prefs/library-location'

/** Files that are already compressed gain nothing from deflate. */
const STORED = /\.(mp3|png|jpe?g|webp|gif|gp|gpx|gp[3-5]|sf3)$/i

export interface BackupDeps {
  db: Db
  libraryRoot: string
  backupDir: string
  appVersion: string
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `TabKing-backup-2026-10-08-143005.zip` (local time, sortable). */
export function backupFileName(d: Date): string {
  return (
    `TabKing-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.zip`
  )
}

/** A backup folder inside the library would be swallowed by the next backup. */
export function backupDirProblem(backupDir: string, libraryRoot: string): string | null {
  const rel = relative(resolve(libraryRoot), resolve(backupDir))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
    ? 'The backup folder cannot be inside the library folder.'
    : null
}

/**
 * BKP-1: one .zip holding `manifest.json`, a consistent copy of the database (`VACUUM INTO`) and every library file.
 * Written to a `.part` file and renamed when complete, so a failed backup never leaves a half archive that looks valid.
 */
export async function createBackup(
  deps: BackupDeps,
  onProgress: (done: number, total: number) => void,
  now = new Date()
): Promise<BackupResult> {
  const { db, libraryRoot, backupDir, appVersion } = deps
  const problem = backupDirProblem(backupDir, libraryRoot)
  if (problem) throw new Error(problem)
  mkdirSync(backupDir, { recursive: true })

  const work = mkdtempSync(join(tmpdir(), 'tabking-backup-'))
  const snapshot = join(work, 'tabking.db')
  let name = backupFileName(now)
  for (let n = 2; existsSync(join(backupDir, name)); n++)
    name = backupFileName(now).replace('.zip', `-${n}.zip`)
  const target = join(backupDir, name)
  const part = `${target}.part`
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.prepare('VACUUM INTO ?').run(snapshot)
    const files = scanFiles(libraryRoot)
    const songs = (db.prepare('SELECT COUNT(*) AS n FROM song').get() as { n: number }).n
    const manifest: BackupManifest = {
      format: 1,
      appVersion,
      schemaVersion: schemaVersion(db),
      createdAt: now.toISOString(),
      songCount: songs,
      fileCount: files.files.length
    }
    const total = files.bytes + statSync(snapshot).size

    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json')
    zip.addFile(snapshot, 'tabking.db')
    for (const rel of files.files) {
      zip.addFile(join(libraryRoot, ...rel.split('/')), `library/${rel}`, {
        compress: !STORED.test(rel)
      })
    }
    zip.end()

    await new Promise<void>((done, fail) => {
      const out = createWriteStream(part)
      let written = 0
      let last = 0
      zip.outputStream.on('data', (chunk: Buffer) => {
        written += chunk.length
        const t = Date.now()
        if (t - last > 100) {
          last = t
          onProgress(Math.min(written, total), total)
        }
      })
      zip.outputStream.on('error', fail)
      out.on('error', fail)
      out.on('close', done)
      zip.outputStream.pipe(out)
    })
    renameSync(part, target)
    onProgress(total, total)
    return { path: target, bytes: statSync(target).size, manifest }
  } catch (e) {
    rmSync(part, { force: true })
    throw e
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

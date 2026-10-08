import Database from 'better-sqlite3'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import type { BackupManifest } from '@shared/types'
import type { Migration } from '../db/migrate'
import { migrate } from '../db/migrate'
import { resolveWithin } from '../library/store'
import { ensureMarker } from '../prefs/library-location'
import { eachEntry, entryStream, openZip, readEntryText } from './zip'

const ManifestSchema = z.object({
  format: z.literal(1),
  appVersion: z.string().max(100),
  schemaVersion: z.number().int().min(1),
  createdAt: z.string().max(100),
  songCount: z.number().int().min(0),
  fileCount: z.number().int().min(0)
})

const NOT_A_BACKUP = 'That file is not a Tab King backup.'

/** Archive entry names are untrusted: only our three kinds of path, never absolute or climbing out. */
function safeName(name: string): boolean {
  if (name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name))
    return false
  return !name.split('/').some((s) => s === '..' || s === '.')
}

/** BKP-2: open the archive and check it is ours, readable, and not newer than this app understands. */
export async function readArchiveInfo(
  zipPath: string,
  latestSchema: number
): Promise<{ manifest: BackupManifest; bytes: number }> {
  const zip = await openZip(zipPath)
  try {
    let manifestText: string | null = null
    let hasDb = false
    await eachEntry(zip, async (entry) => {
      const name = entry.fileName
      if (!safeName(name)) throw new Error(NOT_A_BACKUP)
      if (name === 'manifest.json') manifestText = await readEntryText(zip, entry, 64 * 1024)
      else if (name === 'tabking.db') hasDb = true
      else if (!name.startsWith('library/')) throw new Error(NOT_A_BACKUP)
    })
    if (manifestText === null || !hasDb) throw new Error(NOT_A_BACKUP)
    let json: unknown
    try {
      json = JSON.parse(manifestText)
    } catch {
      throw new Error(NOT_A_BACKUP)
    }
    const parsed = ManifestSchema.safeParse(json)
    if (!parsed.success) throw new Error(NOT_A_BACKUP)
    const manifest = parsed.data
    if (manifest.schemaVersion > latestSchema) {
      throw new Error(
        `This backup was made by a newer Tab King (${manifest.appVersion}). Update the app to restore it.`
      )
    }
    return { manifest, bytes: statSync(zipPath).size }
  } finally {
    zip.close()
  }
}

async function extract(
  zipPath: string,
  dbDest: string,
  libDest: string,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  let total = 0
  const sizing = await openZip(zipPath)
  try {
    await eachEntry(sizing, async (e) => void (total += e.uncompressedSize))
  } finally {
    sizing.close()
  }
  const zip = await openZip(zipPath)
  try {
    let done = 0
    await eachEntry(zip, async (entry) => {
      const name = entry.fileName
      if (name.endsWith('/') || name === 'manifest.json') return
      let dest: string
      if (name === 'tabking.db') dest = dbDest
      else if (name.startsWith('library/'))
        dest = resolveWithin(libDest, name.slice('library/'.length))
      else throw new Error(NOT_A_BACKUP)
      mkdirSync(dirname(dest), { recursive: true })
      await pipeline(await entryStream(zip, entry), createWriteStream(dest))
      done += entry.uncompressedSize
      onProgress(done, total)
    })
  } finally {
    zip.close()
  }
}

/** Open the extracted database, check it and bring it to this build's schema; throws if it is unusable. */
function validateDatabase(file: string, migrations: Migration[]): void {
  const db = new Database(file)
  try {
    const result = db.pragma('integrity_check', { simple: true })
    if (result !== 'ok') throw new Error("The backup's database is damaged.")
    migrate(db, migrations)
    db.prepare('SELECT COUNT(*) FROM song').get()
  } catch (e) {
    throw new Error(
      e instanceof Error && /damaged/.test(e.message)
        ? e.message
        : "The backup's database could not be read.",
      { cause: e }
    )
  } finally {
    db.close()
  }
}

export class RestoreFailure extends Error {
  /** True once the live database was closed: the app can no longer run and must restart. */
  constructor(
    message: string,
    readonly dbClosed: boolean
  ) {
    super(message)
  }
}

export interface RestoreDeps {
  zipPath: string
  dbFile: string
  libraryRoot: string
  migrations: Migration[]
  /** Close the live database; called only after the archive has been fully extracted and validated. */
  closeDb(): void
  onProgress(done: number, total: number, label: string): void
}

const WAL = ['-wal', '-shm']

/**
 * Replace the database and library with the archive's. Everything is extracted and validated (including running the
 * migrations on the copy) before anything is touched; the swap is a set of renames that is undone if any step fails,
 * and the old data is deleted only after the new data is in place. The caller restarts the app afterwards.
 */
export async function restoreArchive(d: RestoreDeps): Promise<void> {
  const stamp = Date.now()
  const stageDb = `${d.dbFile}.restoring`
  const stageLib = `${d.libraryRoot}.restoring`
  const oldDb = `${d.dbFile}.pre-restore-${stamp}`
  const oldLib = `${d.libraryRoot}.pre-restore-${stamp}`
  const cleanStage = (): void => {
    rmSync(stageDb, { force: true })
    rmSync(stageLib, { recursive: true, force: true })
  }
  cleanStage()
  try {
    d.onProgress(0, 0, 'Reading backup…')
    await extract(d.zipPath, stageDb, stageLib, (done, total) =>
      d.onProgress(done, total, 'Extracting files…')
    )
    mkdirSync(stageLib, { recursive: true })
    ensureMarker(stageLib)
    d.onProgress(0, 0, 'Checking the database…')
    validateDatabase(stageDb, d.migrations)
  } catch (e) {
    cleanStage()
    throw new RestoreFailure(e instanceof Error ? e.message : String(e), false)
  }

  d.onProgress(0, 0, 'Swapping in the restored library…')
  const undo: (() => void)[] = []
  try {
    d.closeDb()
    const moved = (from: string, to: string): void => {
      if (!existsSync(from)) return
      renameSync(from, to)
      undo.unshift(() => renameSync(to, from))
    }
    moved(d.dbFile, oldDb)
    for (const s of WAL) moved(`${d.dbFile}${s}`, `${oldDb}${s}`)
    moved(d.libraryRoot, oldLib)
    renameSync(stageDb, d.dbFile)
    undo.unshift(() => renameSync(d.dbFile, stageDb))
    renameSync(stageLib, d.libraryRoot)
  } catch (e) {
    for (const u of undo) {
      try {
        u()
      } catch {
        // best effort: the .pre-restore copies are still on disk
      }
    }
    cleanStage()
    throw new RestoreFailure(
      `Restore failed and your previous library was put back (${e instanceof Error ? e.message : e}).`,
      true
    )
  }
  // The restored data is in place: the previous copies are no longer needed.
  rmSync(oldDb, { force: true })
  for (const s of WAL) rmSync(`${oldDb}${s}`, { force: true })
  rmSync(oldLib, { recursive: true, force: true })
  d.onProgress(1, 1, 'Done')
}

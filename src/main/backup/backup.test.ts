import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yazl from 'yazl'
import { createWriteStream } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_VERSION, MIGRATIONS, openDatabase, type Db } from '../db/connection'
import { LibraryRepo } from '../db/repo/library-repo'
import { SearchRepo } from '../db/repo/search-repo'
import { ensureMarker } from '../prefs/library-location'
import { backupDirProblem, backupFileName, createBackup } from './backup'
import { RestoreFailure, readArchiveInfo, restoreArchive } from './restore'

let tmp: string
let dbFile: string
let lib: string
let backups: string
let db: Db
let repo: LibraryRepo

const put = (rel: string, text: string): void => {
  mkdirSync(join(lib, ...rel.split('/').slice(0, -1)), { recursive: true })
  writeFileSync(join(lib, ...rel.split('/')), text)
}
const backup = (): ReturnType<typeof createBackup> =>
  createBackup({ db, libraryRoot: lib, backupDir: backups, appVersion: '9.9.9' }, () => {})

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'tk-backup-'))
  dbFile = join(tmp, 'ud', 'library.db')
  lib = join(tmp, 'ud', 'library')
  backups = join(tmp, 'backups')
  db = openDatabase(dbFile)
  repo = new LibraryRepo(db)
  mkdirSync(lib, { recursive: true })
  ensureMarker(lib)
  put('Rush/MP/YYZ/yyz.gp', 'GPDATA')
  put('Rush/MP/YYZ/master.mp3', 'MP3DATA')
  repo.createSong({
    artist: 'Rush',
    album: 'MP',
    title: 'YYZ',
    gpPath: 'Rush/MP/YYZ/yyz.gp',
    masterMp3Path: 'Rush/MP/YYZ/master.mp3'
  })
})
afterEach(() => {
  try {
    db.close()
  } catch {
    // already closed by the restore
  }
  rmSync(tmp, { recursive: true, force: true })
})

describe('backup', () => {
  it('names files sortably and refuses a backup folder inside the library', () => {
    expect(backupFileName(new Date(2026, 9, 8, 14, 30, 5))).toBe(
      'TabKing-backup-2026-10-08-143005.zip'
    )
    expect(backupDirProblem(join(lib, 'b'), lib)).toMatch(/inside/)
    expect(backupDirProblem(backups, lib)).toBeNull()
  })

  it('writes an archive with a manifest describing it', async () => {
    const r = await backup()
    expect(r.path.startsWith(backups)).toBe(true)
    expect(r.manifest).toMatchObject({
      format: 1,
      appVersion: '9.9.9',
      schemaVersion: LATEST_SCHEMA_VERSION,
      songCount: 1,
      fileCount: 2
    })
    const info = await readArchiveInfo(r.path, LATEST_SCHEMA_VERSION)
    expect(info.manifest).toEqual(r.manifest)
    expect(existsSync(`${r.path}.part`)).toBe(false)
  })

  it('never overwrites an earlier backup made in the same second', async () => {
    const now = new Date(2026, 0, 1, 12, 0, 0)
    const deps = { db, libraryRoot: lib, backupDir: backups, appVersion: '1' }
    const a = await createBackup(deps, () => {}, now)
    const b = await createBackup(deps, () => {}, now)
    expect(a.path).not.toBe(b.path)
  })
})

describe('backup → wipe → restore (BKP-1, BKP-2)', () => {
  it('brings back songs, search index and files', async () => {
    const { path } = await backup()
    repo.deleteSong(repo.listSongsByArtist(repo.listArtists()[0]!.id)[0]!.id)
    rmSync(join(lib, 'Rush'), { recursive: true })
    put('Other/new.gp', 'NEW')

    const progress: string[] = []
    await restoreArchive({
      zipPath: path,
      dbFile,
      libraryRoot: lib,
      migrations: MIGRATIONS,
      closeDb: () => db.close(),
      onProgress: (_d, _t, label) => void progress.push(label)
    })
    expect(progress.at(-1)).toBe('Done')

    const reopened = openDatabase(dbFile)
    try {
      const songs = new LibraryRepo(reopened).listArtists()
      expect(songs.map((a) => a.name)).toEqual(['Rush'])
      expect(new SearchRepo(reopened, new LibraryRepo(reopened)).search('yyz').songs).toHaveLength(
        1
      )
    } finally {
      reopened.close()
    }
    expect(readFileSync(join(lib, 'Rush/MP/YYZ/yyz.gp'), 'utf8')).toBe('GPDATA')
    expect(readFileSync(join(lib, 'Rush/MP/YYZ/master.mp3'), 'utf8')).toBe('MP3DATA')
    expect(existsSync(join(lib, 'Other'))).toBe(false) // the library is replaced, not merged
    expect(existsSync(join(lib, '.tabking-library'))).toBe(true)
    expect(existsSync(`${dbFile}.restoring`)).toBe(false)
  })

  it('migrates a backup made by an older schema', async () => {
    const { path } = await backup()
    // Rewrite the archive's database as schema v1 by restoring into a fresh DB at v1 only.
    const old = join(tmp, 'old.db')
    const legacy = openDatabase(':memory:')
    legacy.close()
    const Database = (await import('better-sqlite3')).default
    const raw = new Database(old)
    raw.exec(MIGRATIONS[0]!.sql)
    raw.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT)'
    )
    raw
      .prepare('INSERT INTO schema_migrations (version, name) VALUES (1, ?)')
      .run(MIGRATIONS[0]!.name)
    raw.prepare("INSERT INTO artist (name) VALUES ('Old Artist')").run()
    raw.close()
    const zipPath = join(tmp, 'v1.zip')
    const zip = new yazl.ZipFile()
    zip.addBuffer(
      Buffer.from(
        JSON.stringify({
          format: 1,
          appVersion: '0.1.0',
          schemaVersion: 1,
          createdAt: 'x',
          songCount: 0,
          fileCount: 0
        })
      ),
      'manifest.json'
    )
    zip.addFile(old, 'tabking.db')
    zip.end()
    await new Promise((r) => zip.outputStream.pipe(createWriteStream(zipPath)).on('close', r))
    void path

    await restoreArchive({
      zipPath,
      dbFile,
      libraryRoot: lib,
      migrations: MIGRATIONS,
      closeDb: () => db.close(),
      onProgress: () => {}
    })
    const reopened = openDatabase(dbFile)
    try {
      expect(new LibraryRepo(reopened).listArtists().map((a) => a.name)).toEqual(['Old Artist'])
    } finally {
      reopened.close()
    }
  })

  it('leaves everything untouched when the archive is not a backup', async () => {
    const bad = join(tmp, 'bad.zip')
    writeFileSync(bad, 'not a zip')
    await expect(readArchiveInfo(bad, LATEST_SCHEMA_VERSION)).rejects.toThrow(/not a valid backup/)

    const other = join(tmp, 'other.zip')
    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from('hi'), 'readme.txt')
    zip.end()
    await new Promise((r) => zip.outputStream.pipe(createWriteStream(other)).on('close', r))
    await expect(readArchiveInfo(other, LATEST_SCHEMA_VERSION)).rejects.toThrow(
      /not a Tab King backup/
    )
    await expect(
      restoreArchive({
        zipPath: other,
        dbFile,
        libraryRoot: lib,
        migrations: MIGRATIONS,
        closeDb: () => {
          throw new Error('must not be called')
        },
        onProgress: () => {}
      })
    ).rejects.toMatchObject({ dbClosed: false })
    expect(repo.listArtists()).toHaveLength(1) // the live database is still open and intact
    expect(existsSync(join(lib, 'Rush/MP/YYZ/yyz.gp'))).toBe(true)
  })

  it('rejects a backup from a newer schema without touching anything', async () => {
    const { path } = await backup()
    await expect(readArchiveInfo(path, LATEST_SCHEMA_VERSION - 1)).rejects.toThrow(/newer Tab King/)
  })

  it('rejects entries that try to climb out of the library (zip slip)', async () => {
    const evil = join(tmp, 'evil.zip')
    const zip = new yazl.ZipFile()
    const manifest = {
      format: 1,
      appVersion: '1',
      schemaVersion: 1,
      createdAt: 'x',
      songCount: 0,
      fileCount: 1
    }
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json')
    zip.addBuffer(Buffer.from('db'), 'tabking.db')
    zip.addBuffer(Buffer.from('boom'), 'library/zz')
    zip.end()
    const chunks: Buffer[] = []
    for await (const c of zip.outputStream) chunks.push(c as Buffer)
    // Same-length rename of the entry name in both the local and central headers.
    const bytes = Buffer.from(
      Buffer.concat(chunks).toString('latin1').replaceAll('library/zz', 'library/..'),
      'latin1'
    )
    writeFileSync(evil, bytes)
    await expect(readArchiveInfo(evil, LATEST_SCHEMA_VERSION)).rejects.toThrow(
      /not a (valid backup|Tab King backup)/
    )
  })

  it('puts the previous data back if the swap fails', async () => {
    const { path } = await backup()
    let closed = false
    await expect(
      restoreArchive({
        zipPath: path,
        dbFile,
        libraryRoot: lib,
        migrations: MIGRATIONS,
        closeDb: () => {
          db.close()
          closed = true
          // Make the library swap fail: a plain file where the staging folder's parent rename needs to land.
          rmSync(`${lib}.restoring`, { recursive: true, force: true })
        },
        onProgress: () => {}
      })
    ).rejects.toBeInstanceOf(RestoreFailure)
    expect(closed).toBe(true)
    const reopened = openDatabase(dbFile)
    try {
      expect(new LibraryRepo(reopened).listArtists()).toHaveLength(1)
    } finally {
      reopened.close()
    }
    expect(readFileSync(join(lib, 'Rush/MP/YYZ/yyz.gp'), 'utf8')).toBe('GPDATA')
  })
})

import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { loadMigrations, migrate } from './migrate'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'tabking-db-'))
  dirs.push(d)
  return d
}

describe('loadMigrations', () => {
  it('sorts by version and rejects gaps', () => {
    const ok = loadMigrations({ './m/002_b.sql': 'b', './m/001_a.sql': 'a' })
    expect(ok.map((m) => m.version)).toEqual([1, 2])
    expect(() => loadMigrations({ './m/002_b.sql': 'b' })).toThrow(/contiguous/)
  })
})

describe('migrate', () => {
  it('applies pending migrations once and is idempotent', () => {
    const db = new Database(':memory:')
    const ms = loadMigrations({
      './1_a.sql': 'CREATE TABLE a(x)',
      './2_b.sql': 'CREATE TABLE b(x)'
    })
    expect(migrate(db, ms)).toBe(2)
    expect(migrate(db, ms)).toBe(0)
  })

  it('rolls back a failing migration and keeps earlier ones', () => {
    const db = new Database(':memory:')
    const ms = loadMigrations({
      './1_a.sql': 'CREATE TABLE a(x)',
      './2_b.sql': 'CREATE TABLE b(x); INSERT INTO nope VALUES (1)'
    })
    expect(() => migrate(db, ms)).toThrow()
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('a','b')").all()
    expect(tables).toEqual([{ name: 'a' }])
    expect(db.prepare('SELECT MAX(version) v FROM schema_migrations').get()).toEqual({ v: 1 })
  })

  it('backs up an existing DB before migrating and refuses a newer schema', () => {
    const file = join(tmp(), 'lib.db')
    const db = new Database(file)
    try {
      const v1 = { './1_a.sql': 'CREATE TABLE a(x)' }
      migrate(db, loadMigrations(v1), file)
      expect(existsSync(`${file}.bak-v0`)).toBe(false)
      migrate(db, loadMigrations({ ...v1, './2_b.sql': 'CREATE TABLE b(x)' }), file)
      expect(existsSync(`${file}.bak-v1`)).toBe(true)
      expect(() => migrate(db, loadMigrations(v1), file)).toThrow(/newer/)
    } finally {
      db.close() // Windows cannot delete an open database file
    }
  })
})

describe('schema 001', () => {
  it('creates all tables with foreign keys enforced and cascades', () => {
    const db = openDatabase(':memory:')
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of [
      'artist',
      'album',
      'song',
      'song_track',
      'sync_point',
      'playlist',
      'playlist_song',
      'favorite',
      'settings'
    ])
      expect(names).toContain(t)

    db.prepare("INSERT INTO artist(name) VALUES ('Rush')").run()
    expect(() => db.prepare("INSERT INTO artist(name) VALUES ('RUSH')").run()).toThrow(/UNIQUE/)
    db.prepare("INSERT INTO song(artist_id,title,gp_path) VALUES (1,'YYZ','a.gp')").run()
    db.prepare('INSERT INTO favorite(song_id) VALUES (1)').run()
    db.prepare('DELETE FROM song WHERE id=1').run()
    expect(db.prepare('SELECT COUNT(*) c FROM favorite').get()).toEqual({ c: 0 })
    expect(() =>
      db.prepare("INSERT INTO song(artist_id,title,gp_path) VALUES (99,'x','x')").run()
    ).toThrow(/FOREIGN/)
  })
})

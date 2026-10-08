import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadMigrations, migrate } from './migrate'

const migrationFiles = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

export type Db = Database.Database

export const MIGRATIONS = loadMigrations(migrationFiles)
/** The schema version this build creates and understands. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.length

/** Schema version a database is currently at (0 for an empty one). */
export function schemaVersion(db: Db): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null
  }
  return row.v ?? 0
}

/** Open (creating if needed) the library database and bring it up to the latest schema. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db, MIGRATIONS, file === ':memory:' ? undefined : file)
  return db
}

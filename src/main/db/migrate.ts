import type Database from 'better-sqlite3'
import { copyFileSync, existsSync } from 'node:fs'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Load numbered `NNN_name.sql` files bundled at build time. */
export function loadMigrations(files: Record<string, string>): Migration[] {
  const migrations = Object.entries(files).map(([path, sql]) => {
    const m = /(\d+)_([^/]+)\.sql$/.exec(path)
    if (!m) throw new Error(`Bad migration file name: ${path}`)
    return { version: Number(m[1]), name: m[2] ?? '', sql }
  })
  migrations.sort((a, b) => a.version - b.version)
  migrations.forEach((m, i) => {
    if (m.version !== i + 1)
      throw new Error(`Migration versions must be contiguous from 1; found ${m.version}`)
  })
  return migrations
}

/**
 * Apply pending migrations, each in its own transaction (NFR-6).
 * If the DB already has data and migrations are pending, a copy of the file is made first.
 * Returns the number of migrations applied.
 */
export function migrate(db: Database.Database, migrations: Migration[], dbFile?: string): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`)
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null
  }
  const current = row.v ?? 0
  if (current > migrations.length) {
    throw new Error(`Database schema v${current} is newer than this app (v${migrations.length})`)
  }
  const pending = migrations.filter((m) => m.version > current)
  if (pending.length === 0) return 0

  if (current > 0 && dbFile && existsSync(dbFile)) {
    db.pragma('wal_checkpoint(TRUNCATE)')
    copyFileSync(dbFile, `${dbFile}.bak-v${current}`)
  }

  const record = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql)
      record.run(m.version, m.name)
    })()
  }
  return pending.length
}

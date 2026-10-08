import { app } from 'electron'
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Minimal JSON settings file used until the SQLite settings table exists (M1).
 * Writes are atomic (temp file + rename).
 */
export class SettingsStore {
  private data: Record<string, unknown> = {}
  private readonly file: string

  constructor(file = join(app.getPath('userData'), 'settings.json')) {
    this.file = file
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null) {
        this.data = parsed as Record<string, unknown>
      }
    } catch {
      // missing or corrupt: start empty
    }
  }

  get(key: string): unknown {
    return this.data[key]
  }

  set(key: string, value: unknown): void {
    this.data[key] = value
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }
}

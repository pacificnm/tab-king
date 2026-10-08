import { z } from 'zod'
import { DEFAULT_PREFERENCES, THEMES, type Preferences } from '@shared/types'
import type { PreferencesPatch } from '@shared/ipc-contract'

const KEY = 'prefs'
const fileName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^/\\\0]+$/)

const StoredSchema = z.object({
  theme: z.enum(THEMES).catch(DEFAULT_PREFERENCES.theme),
  audio: z
    .object({
      outputDeviceId: z.string().max(500).nullable().catch(null),
      metronomeOn: z.boolean().catch(false),
      countInOn: z.boolean().catch(false),
      soundFont: fileName.nullable().catch(null)
    })
    .catch({ ...DEFAULT_PREFERENCES.audio }),
  libraryDir: z.string().min(1).nullable().catch(null),
  backupDir: z.string().min(1).nullable().catch(null)
})
type Stored = z.infer<typeof StoredSchema>
const DEFAULT_STORED: Stored = { ...DEFAULT_PREFERENCES, libraryDir: null, backupDir: null }

/** The slice of `SettingsStore` this needs; lets tests use a plain object. */
export interface KeyValueStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

/**
 * User preferences in the settings file (PRF-1…3). Corrupt or unknown values fall back to defaults field by field, so
 * a hand-edited file never stops the app from starting.
 */
export class PreferencesStore {
  constructor(private readonly kv: KeyValueStore) {}

  private read(): Stored {
    return StoredSchema.catch(DEFAULT_STORED).parse(this.kv.get(KEY) ?? {})
  }

  private write(next: Stored): void {
    this.kv.set(KEY, next)
  }

  get(): Preferences {
    const { theme, audio } = this.read()
    return { theme, audio }
  }

  update(patch: PreferencesPatch): Preferences {
    const cur = this.read()
    this.write({
      ...cur,
      theme: patch.theme ?? cur.theme,
      audio: { ...cur.audio, ...patch.audio }
    })
    return this.get()
  }

  /** Configured library folder, or null for the default. */
  libraryDir(): string | null {
    return this.read().libraryDir
  }

  setLibraryDir(dir: string | null): void {
    this.write({ ...this.read(), libraryDir: dir })
  }

  backupDir(): string | null {
    return this.read().backupDir
  }

  setBackupDir(dir: string | null): void {
    this.write({ ...this.read(), backupDir: dir })
  }

  setSoundFont(name: string | null): void {
    const cur = this.read()
    this.write({ ...cur, audio: { ...cur.audio, soundFont: name } })
  }
}

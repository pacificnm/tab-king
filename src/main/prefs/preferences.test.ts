import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '@shared/types'
import { PreferencesStore } from './preferences'

const memory = (
  initial?: unknown
): { get(k: string): unknown; set(k: string, v: unknown): void } => {
  const data: Record<string, unknown> = initial === undefined ? {} : { prefs: initial }
  return { get: (k) => data[k], set: (k, v) => void (data[k] = v) }
}

describe('PreferencesStore', () => {
  it('starts with the defaults', () => {
    expect(new PreferencesStore(memory()).get()).toEqual(DEFAULT_PREFERENCES)
  })

  it('merges partial updates and persists them', () => {
    const kv = memory()
    const store = new PreferencesStore(kv)
    store.update({ theme: 'midnight' })
    store.update({ audio: { countInOn: true } })
    expect(new PreferencesStore(kv).get()).toEqual({
      theme: 'midnight',
      audio: { ...DEFAULT_PREFERENCES.audio, countInOn: true }
    })
  })

  it('falls back to defaults field by field when the stored data is damaged', () => {
    const store = new PreferencesStore(
      memory({ theme: 'neon', audio: { metronomeOn: 'yes', countInOn: true, soundFont: '../x' } })
    )
    expect(store.get()).toEqual({
      theme: 'system',
      audio: { outputDeviceId: null, metronomeOn: false, countInOn: true, soundFont: null }
    })
    expect(new PreferencesStore(memory('garbage')).get()).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps locations apart from the preferences the renderer sees', () => {
    const store = new PreferencesStore(memory())
    store.setLibraryDir('/music/tabs')
    store.setBackupDir('/backups')
    store.update({ theme: 'dark' })
    expect(store.libraryDir()).toBe('/music/tabs')
    expect(store.backupDir()).toBe('/backups')
    expect(Object.keys(store.get())).toEqual(['theme', 'audio'])
    store.setLibraryDir(null)
    expect(store.libraryDir()).toBeNull()
  })

  it('only accepts a plain file name for the SoundFont', () => {
    const store = new PreferencesStore(memory())
    store.setSoundFont('Guitars.sf2')
    expect(store.get().audio.soundFont).toBe('Guitars.sf2')
    store.setSoundFont(null)
    expect(store.get().audio.soundFont).toBeNull()
  })
})

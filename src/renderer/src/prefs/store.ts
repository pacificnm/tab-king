import { create } from 'zustand'
import { BUNDLED_SOUNDFONT_URL, type PreferencesView, type Result } from '@shared/types'
import type { PreferencesPatch } from '@shared/ipc-contract'
import { player } from '../player'
import { setTheme } from '../theme'

/** The preferences as main last reported them (null until the first load). */
export const usePrefsStore = create<{ view: PreferencesView | null }>(() => ({ view: null }))

export const currentSoundFontUrl = (): string =>
  usePrefsStore.getState().view?.soundFontUrl ?? BUNDLED_SOUNDFONT_URL

/** Push a preferences change into the live app: theme, audio device, SoundFont and the metronome / count-in switches. */
function applyPrefs(prev: PreferencesView | null, next: PreferencesView): void {
  if (prev?.theme !== next.theme) setTheme(next.theme)
  if (prev?.audio.outputDeviceId !== next.audio.outputDeviceId)
    player.setOutputDevice(next.audio.outputDeviceId)
  if (prev?.audio.metronomeOn !== next.audio.metronomeOn)
    player.setMetronomeOn(next.audio.metronomeOn)
  if (prev?.audio.countInOn !== next.audio.countInOn) player.setCountInOn(next.audio.countInOn)
  if (prev && prev.soundFontUrl !== next.soundFontUrl) player.setSoundFont(next.soundFontUrl)
}

function receive(next: PreferencesView): void {
  const prev = usePrefsStore.getState().view
  usePrefsStore.setState({ view: next })
  applyPrefs(prev, next)
}

/** Load the preferences, apply them, and keep following changes made anywhere (PRF-1…3). */
export function initPrefs(): void {
  window.api.prefs.onChanged(receive)
  void window.api.prefs.get().then(receive)
}

export async function updatePrefs(patch: PreferencesPatch): Promise<Result<PreferencesView>> {
  return window.api.prefs.update(patch)
}

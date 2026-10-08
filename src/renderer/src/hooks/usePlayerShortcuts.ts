import { useEffect } from 'react'
import { player } from '../player'
import { shortcutFor, type PlayerShortcut } from '../player/shortcuts'

const ACTIONS: Record<PlayerShortcut, () => void> = {
  togglePlay: () => player.togglePlay(),
  restart: () => player.restart(),
  speedDown: () => player.stepSpeed(-1),
  speedUp: () => player.stepSpeed(1),
  toggleLoop: () => player.toggleLoop(),
  toggleMetronome: () => player.toggleMetronome(),
  toggleCountIn: () => player.toggleCountIn()
}

/** Global player shortcuts (PLY-7). */
export function usePlayerShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target instanceof HTMLElement ? e.target : null
      const action = shortcutFor({
        key: e.key,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        defaultPrevented: e.defaultPrevented,
        target
      })
      if (!action) return
      if (e.repeat && action !== 'speedDown' && action !== 'speedUp') return
      e.preventDefault()
      ACTIONS[action]()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

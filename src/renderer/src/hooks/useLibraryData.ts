import { useEffect, useEffectEvent, useState } from 'react'

/**
 * Load data and reload it whenever the library changes (edits, favorites, playlists...) or `key` changes.
 * `data` is null until the first load finishes. Stale responses are dropped.
 */
export function useLibraryData<T>(load: () => Promise<T>, key: string | number = ''): T | null {
  const [data, setData] = useState<{ key: string | number; value: T } | null>(null)
  const [version, setVersion] = useState(0)
  const run = useEffectEvent(load)

  useEffect(() => window.api.library.onChanged(() => setVersion((v) => v + 1)), [])

  useEffect(() => {
    let cancelled = false
    void run().then((value) => {
      if (!cancelled) setData({ key, value })
    })
    return () => {
      cancelled = true
    }
  }, [key, version])

  // Never show another key's data (e.g. the previous playlist) while the new one loads.
  return data && data.key === key ? data.value : null
}

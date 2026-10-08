import { useCallback, useEffect, useState } from 'react'
import { Flyout } from './components/Flyout'
import type { MenuAction } from './components/MenuBar'
import { NavMenu, type NavView } from './components/NavMenu'
import { TitleBar } from './components/TitleBar'

const VIEW_TITLES: Record<NavView, string> = {
  playlists: 'Play Lists',
  favorites: 'Favorites',
  artists: 'Artists'
}

export function App(): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<NavView | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.app.getInfo().then((i) => setVersion(i.version))
  }, [])

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const onNav = useCallback((v: NavView) => {
    setMenuOpen(false)
    setView(v)
  }, [])

  const onAction = useCallback((action: MenuAction) => {
    // Real dialogs/flyouts arrive in M6; stubbed here.
    setNotice(`"${action}" is not implemented yet`)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div className="relative flex h-full flex-col bg-bg text-fg">
      <TitleBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} onAction={onAction} />
      <Flyout open={menuOpen} side="left" label="Library" onClose={closeMenu}>
        <NavMenu active={view} onSelect={onNav} />
      </Flyout>
      <main className="flex flex-1 items-center justify-center text-fg-muted">
        <p>{view ? VIEW_TITLES[view] : `Tab King ${version && `v${version}`}`}</p>
      </main>
      {notice && (
        <div
          role="status"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-surface-2 px-4 py-2 text-sm shadow"
        >
          {notice}
        </div>
      )}
    </div>
  )
}

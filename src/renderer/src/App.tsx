import { useCallback, useEffect, useState } from 'react'
import { Flyout } from './components/Flyout'
import { MainMenu, type MenuAction } from './components/MainMenu'
import { TitleBar } from './components/TitleBar'

export function App(): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.app.getInfo().then((i) => setVersion(i.version))
  }, [])

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const onSelect = useCallback((action: MenuAction) => {
    setMenuOpen(false)
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
      <TitleBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} />
      <Flyout open={menuOpen} side="left" label="Main menu" onClose={closeMenu}>
        <MainMenu onSelect={onSelect} />
      </Flyout>
      <main className="flex flex-1 items-center justify-center text-fg-muted">
        <p>Tab King {version && `v${version}`}</p>
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

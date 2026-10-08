import { useEffect, useState } from 'react'
import { MenuBar, type MenuAction } from './MenuBar'

interface Props {
  onMenu: () => void
  menuOpen: boolean
  onAction: (action: MenuAction) => void
}

const btn =
  'app-no-drag inline-flex h-full w-11 items-center justify-center text-fg-muted hover:bg-surface-2 hover:text-fg'

export function TitleBar({ onMenu, menuOpen, onAction }: Props): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.win.isMaximized().then((m) => alive && setMaximized(m))
    const off = window.api.win.onMaximizedChanged(setMaximized)
    return () => {
      alive = false
      off()
    }
  }, [])

  return (
    <header
      className="app-drag flex h-10 shrink-0 items-center border-b border-border bg-surface"
      onDoubleClick={() => void window.api.win.toggleMaximize()}
    >
      <button
        type="button"
        className={btn}
        aria-label="Library menu"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onMenu}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M2 4.5h14M2 9h14M2 13.5h14" strokeLinecap="round" />
        </svg>
      </button>
      <div className="select-none px-2 text-sm font-semibold tracking-wide">
        <span className="text-accent">Tab</span> King
      </div>
      <MenuBar onSelect={onAction} />
      <div className="flex-1" />
      <button
        type="button"
        className={btn}
        aria-label="Minimize"
        onClick={() => void window.api.win.minimize()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor">
          <path d="M1 6h10" />
        </svg>
      </button>
      <button
        type="button"
        className={btn}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void window.api.win.toggleMaximize()}
      >
        {maximized ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="1.5" y="3.5" width="7" height="7" />
            <path d="M3.5 3.5v-2h7v7h-2" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
            <rect x="1.5" y="1.5" width="9" height="9" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className={`${btn} hover:!bg-danger hover:!text-white`}
        aria-label="Close"
        onClick={() => void window.api.win.close()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor">
          <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
        </svg>
      </button>
    </header>
  )
}

import { useEffect, useRef, useState } from 'react'

export type MenuAction = 'preferences' | 'backup-restore' | 'help-contents' | 'about'

interface MenuDef {
  id: string
  label: string
  items: { id: MenuAction; label: string }[]
}

const MENUS: MenuDef[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      { id: 'preferences', label: 'Preferences' },
      { id: 'backup-restore', label: 'Backup / Restore' }
    ]
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { id: 'help-contents', label: 'Help Contents' },
      { id: 'about', label: 'About' }
    ]
  }
]

interface Props {
  onSelect: (action: MenuAction) => void
}

/** File / Help drop-down menus shown in the title bar, right of the app name. */
export function MenuBar({ onSelect }: Props): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(null)
        root.current?.querySelector<HTMLElement>(`[data-menu="${open}"]`)?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const focusItem = (menuId: string, which: 'first' | 'last'): void => {
    requestAnimationFrame(() => {
      const items = root.current?.querySelectorAll<HTMLElement>(
        `[data-panel="${menuId}"] [role="menuitem"]`
      )
      if (items?.length) items[which === 'first' ? 0 : items.length - 1]?.focus()
    })
  }

  const onItemKey = (e: React.KeyboardEvent<HTMLElement>, menuIndex: number): void => {
    const items = [
      ...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    ]
    const i = items.indexOf(e.currentTarget)
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next =
        MENUS[(menuIndex + (e.key === 'ArrowRight' ? 1 : -1) + MENUS.length) % MENUS.length]
      if (next) {
        setOpen(next.id)
        focusItem(next.id, 'first')
      }
    } else return
    e.preventDefault()
  }

  return (
    <div
      ref={root}
      role="menubar"
      aria-label="Application"
      className="app-no-drag flex h-full items-center"
    >
      {MENUS.map((m, mi) => (
        <div key={m.id} className="relative h-full">
          <button
            type="button"
            role="menuitem"
            data-menu={m.id}
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            className={`h-full px-3 text-sm hover:bg-surface-2 ${open === m.id ? 'bg-surface-2' : ''}`}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => open && setOpen(m.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setOpen(m.id)
                focusItem(m.id, 'first')
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setOpen(m.id)
                focusItem(m.id, 'last')
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next =
                  MENUS[(mi + (e.key === 'ArrowRight' ? 1 : -1) + MENUS.length) % MENUS.length]
                root.current?.querySelector<HTMLElement>(`[data-menu="${next?.id}"]`)?.focus()
                if (open && next) setOpen(next.id)
              }
            }}
          >
            {m.label}
          </button>
          {open === m.id && (
            <ul
              role="menu"
              aria-label={m.label}
              data-panel={m.id}
              className="absolute left-0 top-full z-50 min-w-48 rounded-b border border-border bg-surface py-1 shadow-xl"
            >
              {m.items.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2 text-left text-sm hover:bg-surface-2 focus:bg-surface-2"
                    onKeyDown={(e) => onItemKey(e, mi)}
                    onClick={() => {
                      setOpen(null)
                      onSelect(item.id)
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

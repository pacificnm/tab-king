import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ContextMenuItem {
  label: string
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  /** Draw a divider above this item. */
  separator?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

/** Right-click menu: arrow keys, Enter, Esc, outside click. Rendered at app root (fixed position). */
export function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  const ref = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState({ x, y })
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)
  const [active, setActive] = useState(enabled[0] ?? -1)

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      x: Math.max(0, Math.min(x, window.innerWidth - r.width - 4)),
      y: Math.max(0, Math.min(y, window.innerHeight - r.height - 4))
    })
  }, [x, y])

  useEffect(() => {
    ref.current?.focus()
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const move = (dir: 1 | -1): void => {
    if (enabled.length === 0) return
    const at = enabled.indexOf(active)
    setActive(enabled[(at + dir + enabled.length) % enabled.length] ?? -1)
  }
  const run = (i: number): void => {
    const it = items[i]
    if (!it || it.disabled) return
    onClose()
    it.onSelect?.()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') move(1)
    else if (e.key === 'ArrowUp') move(-1)
    else if (e.key === 'Home') setActive(enabled[0] ?? -1)
    else if (e.key === 'End') setActive(enabled[enabled.length - 1] ?? -1)
    else if (e.key === 'Enter' || e.key === ' ') run(active)
    else if (e.key === 'Escape' || e.key === 'Tab') onClose()
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <ul
      ref={ref}
      role="menu"
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] min-w-44 rounded-md border border-border bg-surface py-1 text-sm shadow-xl outline-none"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <li
          key={it.label}
          role="none"
          className={it.separator ? 'mt-1 border-t border-border pt-1' : ''}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={it.disabled}
            aria-disabled={it.disabled}
            className={`block w-full px-3 py-1.5 text-left disabled:cursor-default disabled:text-fg-muted disabled:opacity-60 ${
              active === i ? 'bg-surface-2' : ''
            } ${it.danger ? 'text-danger' : ''}`}
            onMouseEnter={() => !it.disabled && setActive(i)}
            onClick={() => run(i)}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

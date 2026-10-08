import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  side: 'left' | 'right'
  label: string
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Slide-in panel with backdrop, Esc/outside-click close and focus trap. */
export function Flyout({ open, side, label, onClose, children }: Props): React.JSX.Element {
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open, onClose])

  const pos = side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
  const hidden = side === 'left' ? '-translate-x-full' : 'translate-x-full'

  return (
    <div
      className={`absolute inset-0 top-10 z-40 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        ref={panel}
        role="dialog"
        aria-label={label}
        inert={!open}
        className={`absolute bottom-0 top-0 w-72 border-border bg-surface shadow-xl transition-transform duration-200 ${pos} ${open ? 'translate-x-0' : hidden}`}
      >
        {children}
      </aside>
    </div>
  )
}

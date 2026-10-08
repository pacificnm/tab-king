import { useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface Props {
  open: boolean
  side: 'left' | 'right'
  label: string
  onClose: () => void
  /** Tailwind width class; the library menu is narrow, the help panel wider. */
  width?: string
  children: ReactNode
}

/** Slide-in panel with backdrop, Esc/outside-click close and focus trap. */
export function Flyout({
  open,
  side,
  label,
  onClose,
  width = 'w-72',
  children
}: Props): React.JSX.Element {
  const panel = useRef<HTMLElement>(null)
  useFocusTrap(panel, open, onClose)

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
        className={`absolute bottom-0 top-0 max-w-full ${width} border-border bg-surface shadow-xl transition-transform duration-200 ${pos} ${open ? 'translate-x-0' : hidden}`}
      >
        {children}
      </aside>
    </div>
  )
}

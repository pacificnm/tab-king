import { useId, useRef, type ReactNode } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** Modal dialog below the title bar: backdrop, focus trap, Esc to close. */
export function Modal({ title, onClose, children, wide }: Props): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(panel, true, onClose)
  return (
    <div className="absolute inset-0 top-10 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-full w-full flex-col rounded-lg border border-border bg-surface shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <h2 id={titleId} className="border-b border-border px-5 py-3 text-base font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

export const btn =
  'rounded border border-border bg-surface-2 px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimary =
  'rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
export const input =
  'w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:border-accent'

import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  /** Optional cover/art at the left. */
  lead?: ReactNode
  children?: ReactNode
}

/** Title block shared by the library views, with room for action buttons. */
export function ViewHeader({ title, subtitle, lead, children }: Props): React.JSX.Element {
  return (
    <header className="flex items-center gap-4 border-b border-border px-6 py-4">
      {lead}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-fg-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </header>
  )
}

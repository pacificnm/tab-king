export type MenuAction = 'preferences' | 'backup-restore' | 'help-contents' | 'about'

interface Props {
  onSelect: (action: MenuAction) => void
}

const SECTIONS: { title: string; items: { id: MenuAction; label: string }[] }[] = [
  {
    title: 'File',
    items: [
      { id: 'preferences', label: 'Preferences' },
      { id: 'backup-restore', label: 'Backup / Restore' }
    ]
  },
  {
    title: 'Help',
    items: [
      { id: 'help-contents', label: 'Contents' },
      { id: 'about', label: 'About' }
    ]
  }
]

export function MainMenu({ onSelect }: Props): React.JSX.Element {
  return (
    <nav aria-label="Main menu" className="p-3">
      {SECTIONS.map((s) => (
        <div key={s.title} role="group" aria-label={s.title} className="mb-4">
          <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">
            {s.title}
          </h2>
          <ul role="menu">
            {s.items.map((i) => (
              <li key={i.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => onSelect(i.id)}
                >
                  {i.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export type NavView = 'search' | 'playlists' | 'favorites' | 'artists'

interface Props {
  active: NavView | null
  onSelect: (view: NavView) => void
}

const ITEMS: { id: NavView; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'playlists', label: 'Play Lists' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'artists', label: 'Artists' }
]

/** Library navigation shown in the hamburger flyout. */
export function NavMenu({ active, onSelect }: Props): React.JSX.Element {
  return (
    <nav aria-label="Library" className="p-3">
      <ul>
        {ITEMS.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              aria-current={active === i.id ? 'page' : undefined}
              className={`w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                active === i.id ? 'bg-surface-2 font-semibold' : ''
              }`}
              onClick={() => onSelect(i.id)}
            >
              {i.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export type PlayerShortcut =
  | 'togglePlay'
  | 'restart'
  | 'speedDown'
  | 'speedUp'
  | 'toggleLoop'
  | 'toggleMetronome'
  | 'toggleCountIn'

export interface KeyInfo {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  defaultPrevented: boolean
  /** The focused/target element, or null. */
  target: {
    tagName: string
    isContentEditable: boolean
    closest(selector: string): unknown
  } | null
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
/** Widgets that handle keys themselves (and Space natively). */
const OWN_KEYS = '[role="tree"], [role="menu"], [role="menubar"], [aria-modal="true"]'
const ACTIVATES_ON_SPACE = new Set(['BUTTON', 'A', 'SUMMARY'])

/** PLY-7. Returns the player action for a key press, or null when the key belongs to something else. */
export function shortcutFor(e: KeyInfo): PlayerShortcut | null {
  if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return null
  const t = e.target
  if (t && (TYPING.has(t.tagName) || t.isContentEditable || t.closest(OWN_KEYS))) return null
  switch (e.key) {
    case ' ':
      return t && ACTIVATES_ON_SPACE.has(t.tagName) ? null : 'togglePlay'
    case 'Home':
      return 'restart'
    case '[':
      return 'speedDown'
    case ']':
      return 'speedUp'
    case 'l':
    case 'L':
      return 'toggleLoop'
    case 'm':
    case 'M':
      return 'toggleMetronome'
    case 'c':
    case 'C':
      return 'toggleCountIn'
    default:
      return null
  }
}

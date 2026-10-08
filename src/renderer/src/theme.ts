import { THEMES, type ThemeName } from '@shared/types'

export type { ThemeName }

const CACHE_KEY = 'tabking.theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
let current: ThemeName = 'system'

/** The `data-theme` value that has CSS tokens: `system` resolves to light or dark. */
export const resolveTheme = (
  theme: ThemeName,
  systemDark: boolean
): Exclude<ThemeName, 'system'> => (theme === 'system' ? (systemDark ? 'dark' : 'light') : theme)

function apply(): void {
  document.documentElement.dataset.theme = resolveTheme(current, media.matches)
}

/** Switch theme live (PRF-1). The choice itself is persisted by the preferences store in the main process. */
export function setTheme(theme: ThemeName): void {
  current = theme
  apply()
  try {
    localStorage.setItem(CACHE_KEY, theme)
  } catch {
    // storage unavailable: the theme is simply applied again once preferences load
  }
}

/** Apply the last used theme immediately so the window doesn't flash the wrong colours before preferences load. */
export function initTheme(): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached && (THEMES as readonly string[]).includes(cached)) current = cached as ThemeName
  } catch {
    // ignore
  }
  media.addEventListener('change', apply)
  apply()
}

export type ThemeName = 'system' | 'light' | 'dark'

const media = window.matchMedia('(prefers-color-scheme: dark)')
let current: ThemeName = 'system'

function apply(): void {
  const resolved = current === 'system' ? (media.matches ? 'dark' : 'light') : current
  document.documentElement.dataset.theme = resolved
}

/** Sets the theme on <html data-theme>. Preferences UI (M6) will persist the choice. */
export function setTheme(theme: ThemeName): void {
  current = theme
  apply()
}

export function initTheme(): void {
  media.addEventListener('change', apply)
  apply()
}

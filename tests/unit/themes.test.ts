import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEMES } from '@shared/types'

const css = readFileSync(join(__dirname, '../../src/renderer/src/styles/index.css'), 'utf8')

/** Tokens of the rule whose selector list mentions `[data-theme='name']`. */
function tokens(theme: string): Record<string, string> {
  const rule = new RegExp(`[^{}]*\\[data-theme='${theme}'\\][^{]*\\{([^}]*)\\}`).exec(css)
  if (!rule) throw new Error(`no CSS for theme ${theme}`)
  return Object.fromEntries(
    [...rule[1]!.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!])
  )
}

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

const CONCRETE = THEMES.filter((t) => t !== 'system')
const NEEDED = [
  'bg',
  'surface',
  'surface-2',
  'border',
  'fg',
  'fg-muted',
  'accent',
  'accent-fg',
  'danger'
]

describe('theme tokens (PRF-1)', () => {
  it('has at least two colour themes besides light, dark and system', () => {
    expect(THEMES).toEqual(expect.arrayContaining(['system', 'light', 'dark', 'midnight', 'amber']))
  })

  it.each(CONCRETE)('%s defines every token', (theme) => {
    for (const k of NEEDED) expect(tokens(theme), `${theme} --c-${k}`).toHaveProperty(k)
  })

  // WCAG AA for normal text is 4.5:1; the accent is also used for icons and hearts, so it gets the same bar.
  it.each(CONCRETE)('%s keeps text readable on every surface', (theme) => {
    const t = tokens(theme)
    for (const surface of ['bg', 'surface', 'surface-2'] as const) {
      for (const text of ['fg', 'fg-muted', 'accent'] as const) {
        expect(
          contrast(t[text]!, t[surface]!),
          `${theme}: ${text} on ${surface}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(
      contrast(t['accent-fg']!, t['accent']!),
      `${theme}: accent-fg on accent`
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrast(t['danger']!, t['surface']!),
      `${theme}: danger on surface`
    ).toBeGreaterThanOrEqual(4.5)
  })
})

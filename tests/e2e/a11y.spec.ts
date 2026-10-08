import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync, rmSync } from 'node:fs'
import { THEMES } from '../../src/shared/types'
import { launchApp, makeTmp } from './helpers'
import { seedLibrary } from './seed'

// NFR-5: no automatically detectable WCAG 2.1 A/AA problems on any screen, in any theme.
let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
  seedLibrary(tmp, [
    { artist: 'Axe Band', album: 'Axe Album', title: 'Axe Song', trackNo: 1, playable: true },
    { artist: 'Axe Band', album: 'Axe Album', title: 'Second', trackNo: 2, playable: true }
  ])
})
test.afterEach(async () => {
  await app.close().catch(() => undefined)
  rmSync(tmp, { recursive: true, force: true })
})

// @axe-core/playwright opens a second page, which Electron can't; run the engine inside the page instead.
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

interface Violation {
  id: string
  impact: string | null
  help: string
  nodes: { target: unknown[] }[]
}

async function audit(label: string): Promise<void> {
  await page.evaluate(axeSource)
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run(c: unknown, o: unknown): Promise<{ violations: Violation[] }> }
      }
    ).axe
    const r = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
    })
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 4).map((n) => n.target.join(' '))
    }))
  })
  const lines = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.targets.join('\n    ')}`
  )
  expect(lines, `${label}\n${lines.join('\n')}`).toEqual([])
}

async function setTheme(theme: string): Promise<void> {
  await page.evaluate((t) => window.api.prefs.update({ theme: t as never }), theme)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBeTruthy()
}

const menu = async (m: string, item: string): Promise<void> => {
  await page.getByRole('menuitem', { name: m, exact: true }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

for (const theme of THEMES.filter((t) => t !== 'system')) {
  test(`every screen passes the automated accessibility audit — ${theme}`, async () => {
    await setTheme(theme)
    await audit('home')
    await page.getByRole('button', { name: 'Add song…' }).click()
    await audit('add song dialog')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Library menu' }).click()
    const tree = page.getByRole('tree', { name: 'Library' })
    await tree.getByRole('treeitem', { name: 'Artists' }).click()
    await tree.getByRole('treeitem', { name: /Axe Band/ }).click()
    await tree.getByRole('treeitem', { name: /Axe Album/ }).click()
    await audit('library tree')
    await tree.getByRole('treeitem', { name: /Axe Song/ }).click()
    await expect(page.getByRole('article', { name: 'Axe Song' })).toBeVisible()
    await page.waitForTimeout(400)
    await audit('song page')

    for (const nav of ['Search', 'Favorites', 'Play Lists']) {
      await page.getByRole('button', { name: 'Library menu' }).click()
      await page
        .getByRole('tree', { name: 'Library' })
        .getByRole('treeitem', { name: nav, exact: true })
        .click()
      await page.waitForTimeout(400)
      await audit(nav)
    }

    await menu('File', 'Preferences')
    const prefs = page.getByRole('dialog', { name: 'Preferences' })
    for (const tab of ['Appearance', 'Locations', 'Audio', 'App data']) {
      await prefs.getByRole('tab', { name: tab }).click()
      await audit(`preferences / ${tab}`)
    }
    await page.keyboard.press('Escape')

    await menu('File', 'Backup / Restore')
    await audit('backup dialog')
    await page.keyboard.press('Escape')

    await menu('Help', 'About')
    await audit('about')
    await page.keyboard.press('Escape')

    await menu('Help', 'Help Contents')
    await page
      .getByRole('dialog', { name: 'Help Contents' })
      .getByRole('button', { name: 'Keyboard shortcuts' })
      .click()
    await page.waitForTimeout(400)
    await audit('help topic')
    await page.keyboard.press('Escape')
  })
}

test('the player screen (footer, track panel, tab) passes the audit', async () => {
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Axe Band/ }).click()
  await tree.getByRole('treeitem', { name: /Axe Album/ }).click()
  await tree.getByRole('treeitem', { name: /Axe Song/ }).dblclick()
  await expect(
    page.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' })
  ).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' }).click()
  await audit('player')
})

test('menus and dialogs work from the keyboard alone, with a visible focus ring', async () => {
  await page.getByRole('menuitem', { name: 'File', exact: true }).focus()
  await page.keyboard.press('Enter') // opens the menu, focus moves to its first item
  await expect(page.getByRole('menuitem', { name: 'Preferences', exact: true })).toBeFocused()
  await page.keyboard.press('Enter') // Preferences
  const prefs = page.getByRole('dialog', { name: 'Preferences' })
  await expect(prefs).toBeVisible()

  // focus is inside the dialog and stays there however many times Tab is pressed
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true
    )
  }
  // the focused control has a visible outline
  const outline = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement!)
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
  })
  expect(outline.style).not.toBe('none')
  expect(outline.width).toBeGreaterThanOrEqual(1.5) // 2 CSS px, minus display scaling

  // tabs move with the arrow keys
  await prefs.getByRole('tab', { name: 'Appearance' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(prefs.getByRole('tab', { name: 'Locations' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.keyboard.press('Escape')
  await expect(prefs).toBeHidden()
  // focus returns to the page, not to a vanished element
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
})

test('the library tree is operable with the arrow keys', async () => {
  await page.getByRole('button', { name: 'Library menu' }).focus()
  await page.keyboard.press('Enter')
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Search', exact: true }).focus()
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown') // Artists
  await page.keyboard.press('ArrowRight') // expand
  await expect(tree.getByRole('treeitem', { name: /Axe Band/ })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(tree.getByRole('treeitem', { name: /Axe Band/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tree).toBeHidden()
})

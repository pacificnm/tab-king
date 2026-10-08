import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { addSong, launchApp, makeTmp } from './helpers'

let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
  await addSong(app, page, tmp)
})

test.afterEach(async () => {
  await app.close()
  rmSync(tmp, { recursive: true, force: true })
})

const footer = (): ReturnType<Page['getByLabel']> => page.getByLabel('Player', { exact: true })
const measure = async (): Promise<number> => {
  const text = (await footer().getByLabel('Measure', { exact: true }).textContent()) ?? ''
  return Number(/M(\d+)/.exec(text)?.[1] ?? 0)
}

test('plays a GP file: renders the tab, moves the cursor and the clock', async () => {
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  // tab notation is drawn by alphaTab into the surface
  await expect(page.getByTestId('tab-surface').locator('svg').first()).toBeVisible({
    timeout: 20_000
  })
  await expect(footer().getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 20_000 })
  await expect(footer().getByLabel('Time')).not.toHaveText(/^0:00 \//, { timeout: 10_000 })
  await expect(page.getByTestId('tab-surface').locator('.at-cursor-beat').first()).toBeAttached()
  await footer().getByRole('button', { name: 'Stop' }).click()
  await expect(footer().getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(footer().getByLabel('Time')).toHaveText(/^0:00 \//)
})

test('loops 2 bars at 60% with count-in and stays inside the loop', async () => {
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(footer().getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 20_000 })
  await footer().getByRole('button', { name: 'Pause' }).click()

  for (let i = 0; i < 8; i++) await footer().getByRole('button', { name: 'Slower' }).click()
  await expect(footer().getByLabel('Speed value')).toHaveText('60%')

  await page.getByLabel('First bar').fill('1')
  await page.getByLabel('Last bar').fill('2')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(footer().getByLabel('Selected bars')).toHaveText('Bars 1–2')

  await footer().getByRole('button', { name: 'Loop' }).click()
  await footer().getByRole('button', { name: 'Count-in' }).click()
  await expect(footer().getByRole('button', { name: 'Loop' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(footer().getByRole('button', { name: 'Count-in' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  const t0 = Date.now()
  await footer().getByRole('button', { name: 'Play' }).click()
  // 2 bars @120bpm @60% = 6.7s per pass; watch for 14s so at least one wrap happens
  const seen: number[] = []
  while (Date.now() - t0 < 14_000) {
    seen.push(await measure())
    await page.waitForTimeout(150)
  }
  expect(Math.max(...seen)).toBeLessThanOrEqual(2)
  expect(seen).toContain(1)
  expect(seen).toContain(2)
  const wrapped = seen.some((m, i) => i > 0 && seen[i - 1] === 2 && m === 1)
  expect(wrapped).toBe(true)
})

test('keyboard shortcuts toggle metronome and step speed', async () => {
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(footer().getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 20_000 })
  await page.locator('body').click({ position: { x: 5, y: 200 } })
  await page.keyboard.press('m')
  await expect(footer().getByRole('button', { name: 'Metronome' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.keyboard.press('[')
  await expect(footer().getByLabel('Speed value')).toHaveText('95%')
  await page.keyboard.press(' ')
  await expect(footer().getByRole('button', { name: 'Play' })).toBeVisible()
})

test('Next/Previous move by measure and clicking the tab seeks', async () => {
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(footer().getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 20_000 })
  await footer().getByRole('button', { name: 'Stop' }).click()
  await expect(footer().getByLabel('Measure', { exact: true })).toHaveText('M1/8')

  await footer().getByRole('button', { name: 'Next measure' }).click()
  await expect(footer().getByLabel('Measure', { exact: true })).toHaveText('M2/8')
  await footer().getByRole('button', { name: 'Next measure' }).click()
  await footer().getByRole('button', { name: 'Previous measure' }).click()
  // close to the start of a measure, Previous goes back one
  await expect(footer().getByLabel('Measure', { exact: true })).toHaveText('M2/8')

  // clicking a note in a later bar of the rendered tab seeks there (alphaTab's built-in interaction)
  const frets = page.getByTestId('tab-surface').locator('svg text', { hasText: /^3$/ })
  await expect.poll(async () => frets.count()).toBeGreaterThan(4)
  await frets.last().click({ force: true })
  await expect.poll(async () => measure(), { timeout: 5_000 }).toBeGreaterThan(2)
})

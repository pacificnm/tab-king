import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { addSong, launchApp, makeTmp } from './helpers'

let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
})

test.afterEach(async () => {
  await app.close().catch(() => undefined)
  rmSync(tmp, { recursive: true, force: true })
})

const panel = (): ReturnType<Page['getByLabel']> => page.getByLabel('Tracks', { exact: true })
const footer = (): ReturnType<Page['getByLabel']> => page.getByLabel('Player', { exact: true })
const track = (n: number, name: string): ReturnType<Page['getByLabel']> =>
  panel().getByLabel(`Track ${n}: ${name}`)

async function openInPlayer(p: Page): Promise<void> {
  await p.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(
    p.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' })
  ).toBeVisible({
    timeout: 20_000
  })
  await p.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' }).click()
  // wait for the paused state to land before the test changes anything
  await expect(
    p.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Play' })
  ).toBeVisible()
}

test('lists every GP track with name and instrument', async () => {
  await addSong(app, page, tmp)
  await openInPlayer(page)
  await expect(panel().getByRole('listitem')).toHaveCount(2)
  await expect(track(1, 'Lead')).toContainText('Guitar')
  await expect(track(2, 'Bass')).toContainText('Guitar') // alphaTex default program; name is what matters
})

test('each track plays alone and the full mix returns', async () => {
  await addSong(app, page, tmp)
  await openInPlayer(page)
  const faded = (n: number, name: string) => expect(track(n, name)).toHaveClass(/opacity-60/)
  const audible = (n: number, name: string) => expect(track(n, name)).not.toHaveClass(/opacity-60/)

  await audible(1, 'Lead')
  await audible(2, 'Bass')

  // solo/mute set up first, to prove the practice view doesn't disturb them
  await panel().getByRole('button', { name: 'Mute Lead' }).click()
  await faded(1, 'Lead')

  for (const [n, name, other] of [
    [1, 'Lead', [2, 'Bass']],
    [2, 'Bass', [1, 'Lead']]
  ] as const) {
    await panel()
      .getByRole('button', { name: `Practice this track: ${name}` })
      .click()
    await expect(
      panel().getByRole('button', { name: `Practice this track: ${name}` })
    ).toHaveAttribute('aria-pressed', 'true')
    await audible(n, name) // even a muted track is heard when practiced alone
    await faded(other[0], other[1])
    await expect(panel().getByRole('button', { name: 'Back to full mix' })).toBeVisible()
    // the tab shows only this track (alphaTab labels staves with the track name)
    await expect(
      page.getByTestId('tab-surface').locator('svg text', { hasText: other[1] })
    ).toHaveCount(0)
    // still plays
    await footer().getByRole('button', { name: 'Play' }).click()
    await expect(footer().getByLabel('Time')).not.toHaveText(/^0:00 \//, { timeout: 10_000 })
    await footer().getByRole('button', { name: 'Stop' }).click()
  }

  await panel().getByRole('button', { name: 'Back to full mix' }).click()
  await expect(panel().getByRole('button', { name: 'Back to full mix' })).toBeHidden()
  await faded(1, 'Lead') // the user's mute is restored, not lost
  await audible(2, 'Bass')
  await panel().getByRole('button', { name: 'Mute Lead' }).click()
  await audible(1, 'Lead')
  await expect(
    page.getByTestId('tab-surface').locator('svg text', { hasText: 'Bass' }).first()
  ).toBeAttached()
})

test('solo, mute and volume are saved per song and restored after a restart', async () => {
  await addSong(app, page, tmp)
  await openInPlayer(page)
  await panel().getByRole('button', { name: 'Mute Lead' }).click()
  await panel().getByRole('button', { name: 'Solo Bass' }).click()
  await panel().getByLabel('Volume Bass').fill('0.5')
  await expect(track(2, 'Bass')).toContainText('50%')
  await page.waitForTimeout(900) // save is debounced

  await app.close()
  ;({ app, page } = await launchApp(tmp))
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Rush/ }).click()
  await tree.getByRole('treeitem', { name: /Moving Pictures/ }).click()
  await tree.getByRole('treeitem', { name: 'YYZ' }).click()
  await openInPlayer(page)
  await expect(panel().getByRole('button', { name: 'Mute Lead' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(panel().getByRole('button', { name: 'Solo Bass' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(panel().getByRole('button', { name: 'Solo Lead' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await expect(track(2, 'Bass')).toContainText('50%')
})

test('an attached MIDI file can be the synth source', async () => {
  await addSong(app, page, tmp, { midi: true })
  await openInPlayer(page)
  const source = panel().getByLabel('Synth plays notes from')
  await expect(source).toHaveValue('gp')
  await source.selectOption('midi')
  await expect(source).toHaveValue('midi')
  // (the fixture's "MP3" has tags but no audio, so a decode warning is expected; the MIDI file itself must be fine)
  await expect(panel().getByRole('alert').filter({ hasText: /MIDI/ })).toHaveCount(0)

  await footer().getByRole('button', { name: 'Play' }).click()
  await expect(footer().getByLabel('Time')).not.toHaveText(/^0:00 \//, { timeout: 10_000 })
  await footer().getByRole('button', { name: 'Stop' }).click()
  await page.waitForTimeout(900)

  // remembered for next time
  await app.close()
  ;({ app, page } = await launchApp(tmp))
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Rush/ }).click()
  await tree.getByRole('treeitem', { name: /Moving Pictures/ }).click()
  await tree.getByRole('treeitem', { name: 'YYZ' }).click()
  await openInPlayer(page)
  await expect(panel().getByLabel('Synth plays notes from')).toHaveValue('midi')
})

test('a song without a MIDI file offers no MIDI source', async () => {
  await addSong(app, page, tmp)
  await openInPlayer(page)
  await expect(panel().getByLabel('Synth plays notes from')).toHaveCount(0)
})

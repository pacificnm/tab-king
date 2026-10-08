import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { addAudioSong, launchApp, makeTmp } from './helpers'

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
const engine = (): ReturnType<Page['getByLabel']> => panel().getByLabel('Playback engine')
const footer = (): ReturnType<Page['getByLabel']> => page.getByLabel('Player', { exact: true })

async function openPlayer(p: Page, expectEngine: 'MP3' | 'Synth' = 'MP3'): Promise<void> {
  await p.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(p.getByLabel('Tracks', { exact: true }).getByLabel('Playback engine')).toHaveText(
    `Audio: ${expectEngine}`,
    {
      timeout: 30_000
    }
  )
  await p.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' }).click()
  await expect(
    p.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Play' })
  ).toBeVisible()
}

test('master and stems: each track plays alone from its stem and the full mix returns', async () => {
  await addAudioSong(app, page, tmp, { stems: true })
  await openPlayer(page)
  await expect(panel().getByLabel('Band plays from')).toHaveValue('mp3')
  await expect(panel().getByLabel('Source for Lead')).toHaveValue('mp3')

  for (const name of ['Lead', 'Bass']) {
    await panel()
      .getByRole('button', { name: `Practice this track: ${name}` })
      .click()
    await expect(
      panel().getByRole('button', { name: `Practice this track: ${name}` })
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(engine()).toHaveText('Audio: MP3') // the stem, not the synth
    await expect(panel().getByRole('alert')).toHaveCount(0)
    await footer().getByRole('button', { name: 'Play' }).click()
    await expect(footer().getByLabel('Time')).not.toHaveText(/^0:00 \//, { timeout: 10_000 })
    await footer().getByRole('button', { name: 'Stop' }).click()
  }
  await panel().getByRole('button', { name: 'Back to full mix' }).click()
  await expect(engine()).toHaveText('Audio: MP3') // the master again
  await expect(panel().getByRole('button', { name: 'Back to full mix' })).toBeHidden()
})

test('source choices: stems without the master, synth tracks, and the notice when they cannot mix', async () => {
  await addAudioSong(app, page, tmp, { stems: true })
  await openPlayer(page)

  // band from the synth: tracks play from their stems
  await panel().getByLabel('Band plays from').selectOption('synth')
  await expect(engine()).toHaveText('Audio: MP3')
  // mute Lead: only the Bass stem is heard, nothing is silenced
  await panel().getByRole('button', { name: 'Mute Lead' }).click()
  await expect(panel().getByRole('status').filter({ hasText: 'silent while MP3' })).toHaveCount(0)

  // Bass from the synth, Lead muted: everything audible is synth -> the synth engine
  await panel().getByLabel('Source for Bass').selectOption('synth')
  await expect(engine()).toHaveText('Audio: Synth')

  // un-mute Lead: a stem and a synth track can't sound together -> MP3, and we say why
  await panel().getByRole('button', { name: 'Mute Lead' }).click()
  await expect(engine()).toHaveText('Audio: MP3')
  await expect(
    panel().getByRole('status').filter({ hasText: 'silent while MP3 audio plays' })
  ).toBeVisible()
  await expect(footer().getByRole('button', { name: 'Metronome' })).toBeDisabled()
})

test('source choices are remembered', async () => {
  await addAudioSong(app, page, tmp, { stems: true })
  await openPlayer(page)
  await panel().getByLabel('Band plays from').selectOption('synth')
  await panel().getByLabel('Source for Bass').selectOption('synth')
  await panel().getByRole('button', { name: 'Solo Bass' }).click() // heard from the synth only
  await expect(engine()).toHaveText('Audio: Synth')
  await page.waitForTimeout(900)

  await app.close()
  ;({ app, page } = await launchApp(tmp))
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Test/ }).click()
  await tree.getByRole('treeitem', { name: /Fixtures/ }).click()
  await tree.getByRole('treeitem', { name: 'Master' }).click()
  await openPlayer(page, 'Synth')
  await expect(panel().getByLabel('Band plays from')).toHaveValue('synth')
  await expect(panel().getByLabel('Source for Bass')).toHaveValue('synth')
  await expect(panel().getByLabel('Source for Lead')).toHaveValue('mp3')
})

test('a missing MP3 is reported and playback falls back to the synth', async () => {
  await addAudioSong(app, page, tmp)
  rmSync(join(tmp, 'ud', 'library', 'Test', 'Fixtures', 'Master', 'master.mp3'))
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(panel().getByRole('alert')).toContainText(/master MP3/, { timeout: 30_000 })
  await expect(panel().getByRole('alert')).toContainText(/missing/)
  await expect(engine()).toHaveText('Audio: Synth')
  await expect(footer().getByRole('button', { name: /Pause|Play/ })).toBeEnabled({
    timeout: 30_000
  })
})

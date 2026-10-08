import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { addAudioSong, launchApp, makeTmp } from './helpers'

let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
  await addAudioSong(app, page, tmp)
})

test.afterEach(async () => {
  await app.close().catch(() => undefined)
  rmSync(tmp, { recursive: true, force: true })
})

const footer = (): ReturnType<Page['getByLabel']> => page.getByLabel('Player', { exact: true })

async function openPlayer(p: Page): Promise<void> {
  await p.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(p.getByLabel('Tracks', { exact: true }).getByLabel('Playback engine')).toHaveText(
    'Audio: MP3',
    {
      timeout: 30_000
    }
  )
  await p.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' }).click()
  await expect(
    p.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Play' })
  ).toBeVisible()
}

const editor = (): ReturnType<Page['getByRole']> =>
  page.getByRole('dialog', { name: 'Sync audio to tab' })

test('edits the offset and sync points, validates, saves and remembers them', async () => {
  await openPlayer(page)
  await page.getByRole('button', { name: 'Sync audio…' }).click()
  await expect(editor().getByRole('img', { name: 'Audio waveform' })).toBeVisible()

  // offset: type, nudge
  const offset = editor().getByLabel('Start offset (ms)')
  await offset.fill('250')
  await editor().getByRole('button', { name: 'Offset +10 ms' }).click()
  await expect(offset).toHaveValue('260')

  // add a point for bar 5, then edit its time
  await editor().getByLabel('Bar to sync').fill('5')
  await editor().getByRole('button', { name: 'Set bar here' }).click()
  const bar5 = editor().getByLabel('Audio time for bar 5')
  await bar5.fill('9300')
  await editor().getByRole('button', { name: 'Bar 5 later by 10 ms' }).click()
  await expect(bar5).toHaveValue('9310')

  // an out-of-order point is rejected and blocks saving
  await editor().getByLabel('Bar to sync').fill('3')
  await editor().getByRole('button', { name: 'Set bar here' }).click()
  await editor().getByLabel('Audio time for bar 3').fill('99999')
  await expect(editor().getByRole('alert', { name: 'Sync problems' })).toContainText(
    /Bar 5|Measure 5|measure 3|Measure 3/
  )
  await expect(editor().getByRole('button', { name: 'Save' })).toBeDisabled()
  await editor().getByRole('button', { name: 'Delete sync point at bar 3' }).click()
  await expect(editor().getByRole('alert', { name: 'Sync problems' })).toHaveCount(0)

  await editor().getByRole('button', { name: 'Save' }).click()
  await expect(editor()).toBeHidden()

  // remembered across a restart
  await app.close()
  ;({ app, page } = await launchApp(tmp))
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Test/ }).click()
  await tree.getByRole('treeitem', { name: /Fixtures/ }).click()
  await tree.getByRole('treeitem', { name: 'Master' }).click()
  await openPlayer(page)
  await page.getByRole('button', { name: 'Sync audio…' }).click()
  await expect(editor().getByLabel('Start offset (ms)')).toHaveValue('260')
  await expect(editor().getByLabel('Audio time for bar 5')).toHaveValue('9310')
})

test('Cancel puts the saved sync back', async () => {
  await openPlayer(page)
  await page.getByRole('button', { name: 'Sync audio…' }).click()
  await editor().getByLabel('Start offset (ms)').fill('400')
  await editor().getByRole('button', { name: 'Cancel' }).click()
  await expect(editor()).toBeHidden()
  await page.getByRole('button', { name: 'Sync audio…' }).click()
  await expect(editor().getByLabel('Start offset (ms)')).toHaveValue('0')
})

test('plays from a chosen bar while previewing', async () => {
  await openPlayer(page)
  await page.getByRole('button', { name: 'Sync audio…' }).click()
  await editor().getByLabel('Play from bar').fill('4')
  await editor().getByRole('button', { name: 'Play from here' }).click()
  await expect(footer().getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(footer().getByLabel('Measure', { exact: true })).toHaveText(/M[4-6]\/8/)
  await editor().getByRole('button', { name: 'Pause' }).click()
})

test('offers to switch to the master MP3 when the band plays from the synth', async () => {
  await openPlayer(page)
  await page
    .getByLabel('Tracks', { exact: true })
    .getByLabel('Band plays from')
    .selectOption('synth')
  await expect(page.getByLabel('Tracks', { exact: true }).getByLabel('Playback engine')).toHaveText(
    'Audio: Synth'
  )
  await page.getByRole('button', { name: 'Sync audio…' }).click()
  await editor().getByRole('button', { name: 'Use the master MP3' }).click()
  await expect(editor().getByRole('img', { name: 'Audio waveform' })).toBeVisible({
    timeout: 30_000
  })
})

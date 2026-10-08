import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
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

const footer = (): ReturnType<Page['getByLabel']> => page.getByLabel('Player', { exact: true })
const panel = (): ReturnType<Page['getByLabel']> => page.getByLabel('Tracks', { exact: true })
const engine = (): ReturnType<Page['getByLabel']> => panel().getByLabel('Playback engine')
const measure = async (): Promise<number> =>
  Number(
    /M(\d+)/.exec(
      (await footer().getByLabel('Measure', { exact: true }).textContent()) ?? ''
    )?.[1] ?? 0
  )

async function playFromDetail(): Promise<void> {
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
}

test('plays the master MP3 and the cursor follows it', async () => {
  await addAudioSong(app, page, tmp)
  await playFromDetail()
  await expect(engine()).toHaveText('Audio: MP3', { timeout: 30_000 })
  await expect(footer().getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 30_000 })
  await expect(panel().getByRole('alert')).toHaveCount(0)
  // 8 bars at 120 bpm = 2 s a bar: the measure advances with the audio
  await expect.poll(measure, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
  await expect(footer().getByRole('button', { name: 'Metronome' })).toBeDisabled()
})

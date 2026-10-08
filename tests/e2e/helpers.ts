import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { writeGp, writeMidi, writeTaggedMp3 } from './fixtures'

export const makeTmp = (): string => mkdtempSync(join(tmpdir(), 'tabking-e2e-'))

export async function launchApp(tmp: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  env.TABKING_E2E = '1'
  const userData = `--user-data-dir=${join(tmp, 'ud')}`
  // TABKING_EXE runs the suite against a packaged build (npm run dist:dir) instead of out/main.
  const exe = process.env.TABKING_EXE
  const app = await electron.launch(
    exe
      ? { executablePath: exe, args: ['--no-sandbox', userData], env }
      : { args: ['out/main/index.js', userData], env }
  )
  return { app, page: await app.firstWindow() }
}

/** Native dialogs can't be driven by Playwright: answer the next showOpenDialog calls with these files. */
export async function queueFilePicks(app: ElectronApplication, ...files: string[]): Promise<void> {
  await app.evaluate(({ dialog }, queue) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [queue.shift() as string]
    })) as never
  }, files)
}

/** Add "YYZ" by Rush (GP + tagged master MP3) through the Add dialog. */
export async function addSong(
  app: ElectronApplication,
  page: Page,
  tmp: string,
  opts: { midi?: boolean } = {}
): Promise<void> {
  const gp = writeGp(tmp, 'song.gp')
  const mp3 = writeTaggedMp3(tmp, 'master.mp3', {
    title: 'YYZ',
    artist: 'Rush',
    album: 'Moving Pictures'
  })
  await queueFilePicks(app, gp, mp3, ...(opts.midi ? [writeMidi(tmp, 'song.mid')] : []))
  await page.getByRole('button', { name: 'Add song…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add song' })
  await dialog.getByRole('button', { name: 'Choose…' }).first().click()
  await expect(dialog.getByLabel('Title')).toHaveValue('GP Title') // prefilled from the GP file
  await expect(dialog.getByText('1. Lead')).toBeVisible()
  await dialog.getByRole('button', { name: 'Choose…' }).first().click() // master MP3 (GP row now says Replace…)
  await expect(dialog.getByLabel('Title')).toHaveValue('YYZ') // ID3 overrides GP
  await expect(dialog.getByLabel('Artist')).toHaveValue('Rush')
  await expect(dialog.getByLabel('Album')).toHaveValue('Moving Pictures')
  if (opts.midi) await dialog.getByRole('button', { name: 'Choose…' }).first().click() // MIDI row
  await dialog.getByRole('button', { name: 'Add song' }).click()
  await expect(page.getByRole('article', { name: 'YYZ' })).toBeVisible()
}

const fixture = (name: string): string => resolve('tests/fixtures', name)

/**
 * Add a song using the real fixture audio: a master MP3, optionally an attached MIDI file, and optionally one stem per
 * GP track ("Lead" and "Bass"). Tags come from the master fixture (title "Master", artist "Test").
 */
export async function addAudioSong(
  app: ElectronApplication,
  page: Page,
  tmp: string,
  opts: { stems?: boolean; midi?: boolean } = {}
): Promise<void> {
  const gp = writeGp(tmp, 'song.gp')
  const master = join(tmp, 'master.mp3')
  copyFileSync(fixture('master-24s.mp3'), master)
  const picks = [gp, master]
  if (opts.midi) picks.push(writeMidi(tmp, 'song.mid'))
  if (opts.stems) picks.push(fixture('stem-lead-24s.mp3'), fixture('stem-bass-24s.mp3'))
  await queueFilePicks(app, ...picks)
  await page.getByRole('button', { name: 'Add song…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add song' })
  await dialog.getByRole('button', { name: 'Choose…' }).first().click() // Guitar Pro
  await expect(dialog.getByText('1. Lead')).toBeVisible()
  await dialog.getByRole('button', { name: 'Choose…' }).first().click() // master MP3
  await expect(dialog.getByLabel('Title')).toHaveValue('Master')
  if (opts.midi) await dialog.getByRole('button', { name: 'Choose…' }).first().click() // MIDI row
  if (opts.stems) {
    for (const row of ['1. Lead', '2. Bass']) {
      await dialog.getByText(row).locator('..').getByRole('button', { name: 'Choose…' }).click()
      await expect(
        dialog.getByText(row).locator('..').getByRole('button', { name: 'Replace…' })
      ).toBeVisible()
    }
  }
  await dialog.getByRole('button', { name: 'Add song' }).click()
  await expect(page.getByRole('article', { name: 'Master' })).toBeVisible()
}

import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeGp, writeTaggedMp3 } from './fixtures'

export const makeTmp = (): string => mkdtempSync(join(tmpdir(), 'tabking-e2e-'))

export async function launchApp(tmp: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
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
export async function addSong(app: ElectronApplication, page: Page, tmp: string): Promise<void> {
  const gp = writeGp(tmp, 'song.gp')
  const mp3 = writeTaggedMp3(tmp, 'master.mp3', {
    title: 'YYZ',
    artist: 'Rush',
    album: 'Moving Pictures'
  })
  await queueFilePicks(app, gp, mp3)
  await page.getByRole('button', { name: 'Add song…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add song' })
  await dialog.getByRole('button', { name: 'Choose…' }).first().click()
  await expect(dialog.getByLabel('Title')).toHaveValue('GP Title') // prefilled from the GP file
  await expect(dialog.getByText('1. Lead')).toBeVisible()
  await dialog.getByRole('button', { name: 'Choose…' }).first().click() // master MP3 (GP row now says Replace…)
  await expect(dialog.getByLabel('Title')).toHaveValue('YYZ') // ID3 overrides GP
  await expect(dialog.getByLabel('Artist')).toHaveValue('Rush')
  await expect(dialog.getByLabel('Album')).toHaveValue('Moving Pictures')
  await dialog.getByRole('button', { name: 'Add song' }).click()
  await expect(page.getByRole('article', { name: 'YYZ' })).toBeVisible()
}

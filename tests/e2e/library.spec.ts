import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeGp, writeTaggedMp3 } from './fixtures'

let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'tabking-e2e-'))
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  const userData = `--user-data-dir=${join(tmp, 'ud')}`
  // TABKING_EXE runs the suite against a packaged build (npm run dist:dir) instead of out/main.
  const exe = process.env.TABKING_EXE
  app = await electron.launch(
    exe
      ? { executablePath: exe, args: ['--no-sandbox', userData], env }
      : { args: ['out/main/index.js', userData], env }
  )
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
  rmSync(tmp, { recursive: true, force: true })
})

/** Native dialogs can't be driven by Playwright: answer the next showOpenDialog calls with these files. */
async function queueFilePicks(...files: string[]): Promise<void> {
  await app.evaluate(({ dialog }, queue) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [queue.shift() as string]
    })) as never
  }, files)
}

async function addSong(): Promise<void> {
  const gp = writeGp(tmp, 'song.gp')
  const mp3 = writeTaggedMp3(tmp, 'master.mp3', {
    title: 'YYZ',
    artist: 'Rush',
    album: 'Moving Pictures'
  })
  await queueFilePicks(gp, mp3)
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

test('adds a song with GP + MP3 and shows it under Artist → Album → Song with cover art', async () => {
  await addSong()

  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await expect(tree.getByRole('treeitem').nth(0)).toHaveText('Search')
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Rush/ }).click()
  const album = tree.getByRole('treeitem', { name: /Moving Pictures/ })
  await expect(album).toBeVisible()
  // cover art served through tabking://
  await expect(album.locator('img')).toHaveJSProperty('complete', true)
  expect(
    await album.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)
  ).toBeGreaterThan(0)
  await album.click()
  await expect(tree.getByRole('treeitem', { name: 'YYZ' })).toBeVisible()

  // files were copied into the managed library folder
  const lib = join(tmp, 'ud', 'library', 'Rush', 'Moving Pictures')
  expect(existsSync(join(lib, 'cover.png'))).toBe(true)
  expect(readdirSync(join(lib, 'YYZ')).sort()).toEqual(['master.mp3', 'song.gp'])
})

test('context menu offers Add, Edit, Play and delete removes the song and its files', async () => {
  await addSong()
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Rush/ }).click()
  await tree.getByRole('treeitem', { name: /Moving Pictures/ }).click()
  await tree.getByRole('treeitem', { name: 'YYZ' }).click({ button: 'right' })
  const menu = page.getByRole('menu')
  for (const name of ['Add song…', 'Edit…', 'Play'])
    await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Delete…' }).click()
  await page
    .getByRole('dialog', { name: 'Delete song' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Delete song' })).toBeHidden()
  await page.getByRole('button', { name: 'Library menu' }).click()
  await expect(page.getByText('No songs yet')).toBeVisible()
  expect(readdirSync(join(tmp, 'ud', 'library'))).toEqual([])
})

test('a song with a missing file is reported, not fatal', async () => {
  await addSong()
  rmSync(join(tmp, 'ud', 'library', 'Rush', 'Moving Pictures', 'YYZ', 'master.mp3'))
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Rush/ }).click()
  await tree.getByRole('treeitem', { name: /Moving Pictures/ }).click()
  await tree.getByRole('treeitem', { name: 'YYZ' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '1 file is missing' })).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('missing Master MP3')
})

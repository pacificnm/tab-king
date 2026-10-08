import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { addSong, launchApp, makeTmp } from './helpers'

let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
})

test.afterEach(async () => {
  await app.close()
  rmSync(tmp, { recursive: true, force: true })
})

test('adds a song with GP + MP3 and shows it under Artist → Album → Song with cover art', async () => {
  await addSong(app, page, tmp)

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
  await addSong(app, page, tmp)
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
  // only the marker that identifies the folder as Tab King's remains
  expect(readdirSync(join(tmp, 'ud', 'library'))).toEqual(['.tabking-library'])
})

test('a song with a missing file is reported, not fatal', async () => {
  await addSong(app, page, tmp)
  rmSync(join(tmp, 'ud', 'library', 'Rush', 'Moving Pictures', 'YYZ', 'master.mp3'))
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Rush/ }).click()
  await tree.getByRole('treeitem', { name: /Moving Pictures/ }).click()
  await tree.getByRole('treeitem', { name: 'YYZ' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '1 file is missing' })).toBeVisible()
  // a missing MP3 doesn't stop the tab from playing, but a missing Guitar Pro file does
  rmSync(join(tmp, 'ud', 'library', 'Rush', 'Moving Pictures', 'YYZ', 'song.gp'))
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('missing Guitar Pro file')
})

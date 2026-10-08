import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { launchApp, makeTmp } from './helpers'
import { seedLibrary, type SeedSong } from './seed'

let tmp: string
let app: ElectronApplication
let page: Page

const LIBRARY: SeedSong[] = [
  {
    artist: 'Rush',
    album: 'Moving Pictures',
    title: 'Tom Sawyer',
    genre: 'Progressive rock',
    trackNo: 1
  },
  { artist: 'Rush', album: 'Moving Pictures', title: 'YYZ', trackNo: 2 },
  { artist: 'Rush', album: 'Signals', title: 'Subdivisions', trackNo: 1 },
  { artist: 'Yes', album: 'Fragile', title: 'Roundabout', genre: 'Progressive rock', trackNo: 1 },
  { artist: 'Mötley Crüe', album: 'Dr. Feelgood', title: 'Kickstart My Heart', trackNo: 1 }
]

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
  seedLibrary(tmp, LIBRARY)
})

test.afterEach(async () => {
  await app.close().catch(() => undefined)
  rmSync(tmp, { recursive: true, force: true })
})

/** Click a top-level library item. Artists and Play Lists expand in place, so the flyout stays open for them. */
const nav = async (name: string, closeFlyout = false): Promise<void> => {
  const flyout = page.getByRole('dialog', { name: 'Library' })
  if (!(await flyout.isVisible())) await page.getByRole('button', { name: 'Library menu' }).click()
  await page
    .getByRole('tree', { name: 'Library' })
    .getByRole('treeitem', { name: name, exact: true })
    .click()
  if (closeFlyout) {
    await page.keyboard.press('Escape')
    await expect(page.locator('aside[aria-label="Library"]')).toHaveJSProperty('inert', true)
  }
}
const search = (): ReturnType<Page['getByLabel']> => page.getByLabel('Search the library')
const row = (title: string): ReturnType<Page['getByRole']> =>
  page.getByRole('listitem', { name: new RegExp(`^${title} by`) })

test.describe('search (NAV-4)', () => {
  test('finds songs as you type, by title, artist, album and genre, grouped by type', async () => {
    await nav('Search')
    await search().fill('tom saw')
    await expect(row('Tom Sawyer')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Songs' }).getByRole('listitem')).toHaveCount(1)

    await search().fill('rush')
    await expect(page.getByRole('list', { name: 'Songs' }).getByRole('listitem')).toHaveCount(3)
    await expect(
      page.getByRole('list', { name: 'Albums' }).getByRole('button', { name: /Moving Pictures/ })
    ).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Albums' }).getByRole('button', { name: /Signals/ })
    ).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Artists' }).getByRole('button', { name: /Rush/ })
    ).toBeVisible()

    await search().fill('progressive')
    await expect(page.getByRole('list', { name: 'Songs' }).getByRole('listitem')).toHaveCount(2)
    await search().fill('crue') // accent-insensitive
    await expect(row('Kickstart My Heart')).toBeVisible()
    await search().fill('zzzz')
    await expect(
      page.getByRole('status').filter({ hasText: 'No matches for "zzzz"' })
    ).toBeVisible()
    await expect(page.getByRole('list', { name: 'Songs' })).toHaveCount(0)
  })

  test('opens an album or artist from the results', async () => {
    await nav('Search')
    await search().fill('moving')
    await page
      .getByRole('list', { name: 'Albums' })
      .getByRole('button', { name: /Moving Pictures/ })
      .click()
    await expect(page.getByRole('heading', { name: 'Moving Pictures' })).toBeVisible()
    await expect(row('Tom Sawyer')).toBeVisible()
    await expect(row('YYZ')).toBeVisible()
    await expect(row('Subdivisions')).toHaveCount(0)

    await nav('Search')
    await search().fill('rush')
    await page.getByRole('list', { name: 'Artists' }).getByRole('button', { name: /Rush/ }).click()
    await expect(page.getByRole('heading', { name: 'Rush' })).toBeVisible()
    await expect(row('Subdivisions')).toBeVisible()
  })

  test('opens a song from the results and picks up edits', async () => {
    await nav('Search')
    await search().fill('yyz')
    await row('YYZ').getByRole('button', { name: /YYZ/ }).first().click()
    await expect(page.getByRole('article', { name: 'YYZ' })).toBeVisible()
  })
})

test.describe('favorites (NAV-5)', () => {
  test('a heart toggles a favorite and the Favorites view lists it', async () => {
    await nav('Search')
    await search().fill('tom')
    await page.getByRole('button', { name: 'Add to favorites: Tom Sawyer' }).click()
    await expect(
      page.getByRole('button', { name: 'Remove from favorites: Tom Sawyer' })
    ).toBeVisible()

    await nav('Favorites')
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible()
    await expect(row('Tom Sawyer')).toBeVisible()

    await page.getByRole('button', { name: 'Remove from favorites: Tom Sawyer' }).click()
    await expect(page.getByText('No favorites yet')).toBeVisible()
  })

  test('the tree shows the heart and the context menu toggles it', async () => {
    await nav('Artists')
    const tree = page.getByRole('tree', { name: 'Library' })
    await tree.getByRole('treeitem', { name: /Rush/ }).click()
    await tree.getByRole('treeitem', { name: /Moving Pictures/ }).click()
    await tree.getByRole('treeitem', { name: /YYZ/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Add to favorites' }).click()
    await expect(tree.getByRole('button', { name: 'Remove from favorites: YYZ' })).toBeVisible()
    await tree.getByRole('treeitem', { name: /YYZ/ }).click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Remove from favorites' })).toBeVisible()
    await page.keyboard.press('Escape')

    await nav('Favorites')
    await expect(row('YYZ')).toBeVisible()
  })

  test('the song page has a favorite toggle too', async () => {
    await nav('Search')
    await search().fill('subdiv')
    await row('Subdivisions')
      .getByRole('button', { name: /Subdivisions/ })
      .first()
      .click()
    const article = page.getByRole('article', { name: 'Subdivisions' })
    await article.getByRole('button', { name: 'Add to favorites' }).click()
    await expect(article.getByRole('button', { name: 'Remove from favorites' })).toBeVisible()
  })
})

test.describe('play lists (NAV-6)', () => {
  const names = async (): Promise<string[]> =>
    (await page.getByRole('list', { name: 'Warmups' }).getByRole('listitem').allInnerTexts()).map(
      (t) => t.split('\n')[0]!
    )

  async function makeWarmups(): Promise<void> {
    await nav('Play Lists', true)
    await page.getByRole('button', { name: 'New play list…' }).click()
    await page.getByRole('dialog', { name: 'New play list' }).getByLabel('Name').fill('Warmups')
    await page
      .getByRole('dialog', { name: 'New play list' })
      .getByRole('button', { name: 'Create' })
      .click()
    await expect(page.getByRole('heading', { name: 'Warmups' })).toBeVisible()
    await page.getByRole('button', { name: 'Add songs…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add songs to Warmups' })
    await dialog.getByLabel('Find songs to add').fill('rush')
    for (const t of ['Tom Sawyer', 'YYZ', 'Subdivisions'])
      await dialog.getByRole('checkbox', { name: new RegExp(t) }).check()
    await dialog.getByRole('button', { name: 'Add 3' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Added 3 songs to "Warmups"' })
    ).toBeVisible()
  }

  test('create, add songs, reorder with the buttons, remove, rename and delete', async () => {
    await makeWarmups()
    await expect(page.getByRole('list', { name: 'Warmups' }).getByRole('listitem')).toHaveCount(3)
    const initial = await names()
    expect(new Set(initial)).toEqual(new Set(['Tom Sawyer', 'YYZ', 'Subdivisions']))

    // keyboard-accessible reordering: first goes down one place
    await page.getByRole('button', { name: `Move ${initial[0]} down` }).click()
    await expect.poll(names).toEqual([initial[1], initial[0], initial[2]])
    await page.getByRole('button', { name: `Move ${initial[2]} up` }).click()
    await expect.poll(names).toEqual([initial[1], initial[2], initial[0]])
    await expect(page.getByRole('button', { name: `Move ${initial[1]} up` })).toBeDisabled()

    await page.getByRole('button', { name: `Remove ${initial[2]} from play list` }).click()
    await expect(page.getByRole('list', { name: 'Warmups' }).getByRole('listitem')).toHaveCount(2)

    await page.getByRole('button', { name: 'Rename…' }).click()
    await page.getByRole('dialog', { name: 'Rename play list' }).getByLabel('Name').fill('Scales')
    await page
      .getByRole('dialog', { name: 'Rename play list' })
      .getByRole('button', { name: 'Save' })
      .click()
    await expect(page.getByRole('heading', { name: 'Scales' })).toBeVisible()

    await page.getByRole('button', { name: 'Delete…' }).click()
    await page
      .getByRole('dialog', { name: 'Delete play list' })
      .getByRole('button', { name: 'Delete' })
      .click()
    await expect(page.locator('main').getByText('No play lists yet')).toBeVisible()
    await nav('Search')
    await search().fill('rush') // the songs are still in the library
    await expect(page.getByRole('list', { name: 'Songs' }).getByRole('listitem')).toHaveCount(3)
  })

  test('reorders by dragging and remembers the order after a restart', async () => {
    await makeWarmups()
    const initial = await names()
    const rows = page.getByRole('list', { name: 'Warmups' }).getByRole('listitem')
    await rows.nth(2).dragTo(rows.nth(0)) // last song dropped on the first row
    await expect.poll(names).toEqual([initial[2], initial[0], initial[1]])
    const expected = [initial[2], initial[0], initial[1]]

    await app.close()
    ;({ app, page } = await launchApp(tmp))
    await nav('Play Lists', true)
    await page
      .getByRole('list', { name: 'Play lists' })
      .getByRole('button', { name: /Warmups/ })
      .click()
    await expect.poll(names).toEqual(expected)
  })

  test('names must be unique and the song menu adds to a play list without duplicating', async () => {
    await makeWarmups()
    await nav('Play Lists', true)
    await page.getByRole('button', { name: 'New play list…' }).click()
    const dialog = page.getByRole('dialog', { name: 'New play list' })
    await dialog.getByLabel('Name').fill('warmups')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog.getByRole('alert')).toContainText('already exists')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // from a song's context menu in the tree: add it, then add it again (already there)
    await nav('Artists')
    const tree = page.getByRole('tree', { name: 'Library' })
    await tree.getByRole('treeitem', { name: /Yes/ }).click()
    await tree.getByRole('treeitem', { name: /Fragile/ }).click()
    await tree.getByRole('treeitem', { name: /Roundabout/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Add to play list…' }).click()
    const add = page.getByRole('dialog', { name: 'Add to play list' })
    await add.getByRole('radio', { name: /Warmups/ }).check()
    await add.getByRole('button', { name: 'Add' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Added 1 song to "Warmups"' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Library menu' }).click() // the dialog closed the flyout
    await tree.getByRole('treeitem', { name: /Roundabout/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Add to play list…' }).click()
    await add.getByRole('radio', { name: /Warmups/ }).check()
    await add.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Already in "Warmups"' })).toBeVisible()
  })

  test('play lists show in the tree and have a context menu', async () => {
    await makeWarmups()
    await page.getByRole('button', { name: 'Library menu' }).click() // the Play Lists branch is still expanded
    const tree = page.getByRole('tree', { name: 'Library' })
    await expect(tree.getByRole('treeitem', { name: /Warmups/ })).toBeVisible()
    await tree.getByRole('treeitem', { name: /Warmups/ }).click({ button: 'right' })
    for (const name of ['Add songs…', 'Rename…', 'Play', 'Delete…']) {
      await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
    }
  })
})

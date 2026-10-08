import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { launchApp, makeTmp } from './helpers'
import { seedLibrary } from './seed'

let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
  // each song is a real 2-bar (4 s) Guitar Pro file
  seedLibrary(tmp, [
    { artist: 'Q Band', album: 'Queue Album', title: 'Q1', trackNo: 1, playable: true },
    { artist: 'Q Band', album: 'Queue Album', title: 'Q2', trackNo: 2, playable: true },
    { artist: 'Q Band', album: 'Queue Album', title: 'Q3', trackNo: 3, playable: true },
    { artist: 'Other', album: 'Solo', title: 'Lonely', trackNo: 1, playable: true }
  ])
})

test.afterEach(async () => {
  await app.close().catch(() => undefined)
  rmSync(tmp, { recursive: true, force: true })
})

const footer = (): ReturnType<Page['getByLabel']> => page.getByLabel('Player', { exact: true })
const position = (): ReturnType<Page['getByLabel']> => footer().getByLabel('Queue position')
const nowPlaying = (title: string): ReturnType<Page['getByRole']> =>
  footer().getByRole('button', { name: new RegExp(`^${title} —`) })

async function openAlbumInTree(): Promise<ReturnType<Page['getByRole']>> {
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Q Band/ }).click()
  await tree.getByRole('treeitem', { name: /Queue Album/ }).click()
  return tree
}

test('playing an album queues it and plays through to the end (PLY-8)', async () => {
  const tree = await openAlbumInTree()
  await tree.getByRole('treeitem', { name: /Queue Album/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Play', exact: true }).click()

  await expect(nowPlaying('Q1')).toBeVisible({ timeout: 20_000 })
  await expect(position()).toHaveText('1/3')
  await expect(footer().getByRole('button', { name: 'Previous song' })).toBeDisabled()

  // Q1 is 4 s long: Q2 and then Q3 start by themselves
  await expect(nowPlaying('Q2')).toBeVisible({ timeout: 25_000 })
  await expect(position()).toHaveText('2/3')
  await expect(footer().getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 20_000 })
  await expect(nowPlaying('Q3')).toBeVisible({ timeout: 25_000 })
  await expect(position()).toHaveText('3/3')
  await expect(footer().getByRole('button', { name: 'Next song' })).toBeDisabled()

  // the end of the queue: playback just stops
  await expect(footer().getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 25_000 })
  await expect(nowPlaying('Q3')).toBeVisible()
})

test('Next and Previous song step through the queue', async () => {
  const tree = await openAlbumInTree()
  await tree.getByRole('treeitem', { name: 'Q2' }).dblclick() // double-click plays it with the album as the queue
  await expect(nowPlaying('Q2')).toBeVisible({ timeout: 20_000 })
  await expect(position()).toHaveText('2/3')

  await footer().getByRole('button', { name: 'Next song' }).click()
  await expect(nowPlaying('Q3')).toBeVisible({ timeout: 20_000 })
  await expect(position()).toHaveText('3/3')
  await footer().getByRole('button', { name: 'Previous song' }).click()
  await expect(nowPlaying('Q2')).toBeVisible({ timeout: 20_000 })
  await footer().getByRole('button', { name: 'Previous song' }).click()
  await expect(nowPlaying('Q1')).toBeVisible({ timeout: 20_000 })
  await expect(position()).toHaveText('1/3')
})

test('a missing song is skipped with a message', async () => {
  rmSync(`${tmp}/ud/library/Q Band/Queue Album/Q2/song.gp`)
  const tree = await openAlbumInTree()
  await tree.getByRole('treeitem', { name: /Queue Album/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Play', exact: true }).click()
  await expect(nowPlaying('Q1')).toBeVisible({ timeout: 20_000 })
  await footer().getByRole('button', { name: 'Next song' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Can\'t play "Q2"' })).toBeVisible()
  await expect(nowPlaying('Q3')).toBeVisible({ timeout: 20_000 })
  await expect(position()).toHaveText('3/3')
})

test('a single song has no queue controls, and a play list plays in its order', async () => {
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Other/ }).click()
  await tree.getByRole('treeitem', { name: /Solo/ }).click()
  await tree.getByRole('treeitem', { name: 'Lonely' }).dblclick()
  await expect(nowPlaying('Lonely')).toBeVisible({ timeout: 20_000 })
  await expect(footer().getByRole('group', { name: 'Queue' })).toHaveCount(0)

  // a play list: Q3, Lonely, Q1
  const ids = await page.evaluate(async () => {
    const lib = window.api.library
    const made = await lib.playlists.create('Mixed')
    if (!made.ok) throw new Error(made.error)
    const artists = await lib.listArtists()
    const songs = (await Promise.all(artists.map((a) => lib.listSongsByArtist(a.id)))).flat()
    const by = (t: string): number => songs.find((s) => s.title === t)!.id
    await lib.playlists.add(made.value.id, [by('Q3'), by('Lonely'), by('Q1')])
    return made.value.id
  })
  expect(ids).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Library menu' }).click() // playing closed the flyout
  await tree.getByRole('treeitem', { name: 'Play Lists' }).click()
  await tree.getByRole('treeitem', { name: /Mixed/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Play', exact: true }).click()
  await expect(nowPlaying('Q3')).toBeVisible({ timeout: 20_000 })
  await expect(position()).toHaveText('1/3')
  await footer().getByRole('button', { name: 'Next song' }).click()
  await expect(nowPlaying('Lonely')).toBeVisible({ timeout: 20_000 })
})

import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join, resolve } from 'node:path'
import { launchApp, makeTmp, queueFilePicks } from './helpers'
import { seedLibrary } from './seed'

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

async function openFileMenu(item: string): Promise<void> {
  await page.getByRole('menuitem', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

async function openPrefs(tab: string): Promise<ReturnType<Page['getByRole']>> {
  await openFileMenu('Preferences')
  const dialog = page.getByRole('dialog', { name: 'Preferences' })
  await dialog.getByRole('tab', { name: tab }).click()
  return dialog
}

const theme = (): Promise<string | undefined> =>
  page.evaluate(() => document.documentElement.dataset.theme)

test('themes apply live and are remembered (PRF-1)', async () => {
  const dialog = await openPrefs('Appearance')
  for (const name of ['Midnight', 'Amber', 'Light', 'Dark']) {
    await dialog.getByRole('radio', { name }).click()
    await expect(dialog.getByRole('radio', { name })).toBeChecked()
    await expect.poll(theme).toBe(name.toLowerCase())
  }
  await dialog.getByRole('radio', { name: 'Midnight' }).click()
  await expect.poll(theme).toBe('midnight')
  // the page really repaints with the theme's colours
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(11, 18, 32)')

  await app.close()
  ;({ app, page } = await launchApp(tmp))
  await expect.poll(theme).toBe('midnight')
  await openFileMenu('Preferences')
  await page
    .getByRole('dialog', { name: 'Preferences' })
    .getByRole('tab', { name: 'Appearance' })
    .click()
  await expect(page.getByRole('radio', { name: 'Midnight' })).toBeChecked()
})

test('System follows the operating system setting', async () => {
  const dialog = await openPrefs('Appearance')
  await page.emulateMedia({ colorScheme: 'light' })
  await dialog.getByRole('radio', { name: 'System' }).click()
  await expect.poll(theme).toBe('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(theme).toBe('dark')
})

test('audio defaults are saved and applied when a song opens (PRF-3)', async () => {
  const dialog = await openPrefs('Audio')
  await expect(dialog.getByLabel('Output device')).toHaveValue('')
  await dialog.getByLabel('Metronome on').click()
  await expect(dialog.getByLabel('Metronome on')).toBeChecked()
  await dialog.getByLabel('Count-in on').click()
  await expect(dialog.getByLabel('Count-in on')).toBeChecked()
  await app.close()
  ;({ app, page } = await launchApp(tmp))
  seedLibrary(tmp, [
    { artist: 'Prefs Band', album: 'Prefs Album', title: 'Prefs Song', playable: true }
  ])
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Prefs Band/ }).click()
  await tree.getByRole('treeitem', { name: /Prefs Album/ }).click()
  await tree.getByRole('treeitem', { name: /Prefs Song/ }).dblclick()
  await expect(
    page.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' })
  ).toBeVisible({
    timeout: 20_000
  })
  const state = await page.evaluate(() => window.__tabking!.state())
  expect(state.metronomeOn).toBe(true)
  expect(state.countInOn).toBe(true)
})

test('a chosen SoundFont is copied, used by the synth, and can be undone (PRF-3)', async () => {
  seedLibrary(tmp, [
    { artist: 'Prefs Band', album: 'Prefs Album', title: 'Prefs Song', playable: true }
  ])
  const font = join(tmp, 'My Bank.sf3')
  copyFileSync(resolve('resources/soundfont/sonivox.sf3'), font) // a genuine SoundFont under another name
  await queueFilePicks(app, font)
  const dialog = await openPrefs('Audio')
  await expect(dialog.getByTestId('soundfont-name')).toContainText('Built-in')
  await dialog.getByRole('button', { name: 'Choose SoundFont…' }).click()
  await expect(dialog.getByTestId('soundfont-name')).toHaveText('My Bank.sf3')
  expect(existsSync(join(tmp, 'ud', 'soundfonts', 'My Bank.sf3'))).toBe(true)

  // it is served to the renderer and a song still plays with it
  const served = await page.evaluate(
    async () => (await fetch('tabking://soundfonts/My%20Bank.sf3')).status
  )
  expect(served).toBe(200)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Library menu' }).click()
  const tree = page.getByRole('tree', { name: 'Library' })
  await tree.getByRole('treeitem', { name: 'Artists' }).click()
  await tree.getByRole('treeitem', { name: /Prefs Band/ }).click()
  await tree.getByRole('treeitem', { name: /Prefs Album/ }).click()
  await tree.getByRole('treeitem', { name: /Prefs Song/ }).dblclick()
  await expect(
    page.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' })
  ).toBeVisible({
    timeout: 20_000
  })

  const again = await openPrefs('Audio')
  await again.getByRole('button', { name: 'Use built-in bank' }).click()
  await expect(again.getByTestId('soundfont-name')).toContainText('Built-in')
  expect(readdirSync(join(tmp, 'ud', 'soundfonts'))).toEqual([])

  // the swap happened under a live player: it still plays afterwards
  await again.getByRole('button', { name: 'Close' }).click()
  const footer = page.getByLabel('Player', { exact: true })
  await expect(footer.getByRole('button', { name: /^(Play|Pause)$/ })).toBeEnabled({
    timeout: 20_000
  })
  await page.evaluate(() => window.__tabking!.player.restart())
  await page.evaluate(() => window.__tabking!.player.pause())
  await footer.getByRole('button', { name: 'Play' }).click()
  await expect(footer.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => (await page.evaluate(() => window.__tabking!.state())).positionMs, {
      timeout: 10_000
    })
    .toBeGreaterThan(300)
})

test('a file that is not a SoundFont is refused', async () => {
  const fake = join(tmp, 'fake.sf2')
  copyFileSync(resolve('tests/fixtures/master-24s.mp3'), fake)
  await queueFilePicks(app, fake)
  const dialog = await openPrefs('Audio')
  await dialog.getByRole('button', { name: 'Choose SoundFont…' }).click()
  await expect(dialog.getByRole('alert')).toContainText('not a SoundFont')
  await expect(dialog.getByTestId('soundfont-name')).toContainText('Built-in')
})

test('moving the library copies the files, switches, and can remove the old copies (PRF-2)', async () => {
  const [id] = seedLibrary(tmp, [{ artist: 'M', album: 'A', title: 'Movable', playable: true }])
  const oldDir = join(tmp, 'ud', 'library')
  const newDir = join(tmp, 'elsewhere', 'Tab King Library')
  const song = (root: string): string => join(root, 'M', 'A', 'Movable', 'song.gp')
  expect(existsSync(song(oldDir))).toBe(true)

  await queueFilePicks(app, newDir)
  const dialog = await openPrefs('Locations')
  await expect(dialog.getByTestId('path-Library folder')).toHaveText(oldDir)
  await dialog.getByRole('button', { name: 'Change…' }).first().click()
  const move = page.getByRole('dialog', { name: 'Library folder' })
  await expect(move).toContainText('Copy your 1 library file')
  await move.getByRole('button', { name: 'Copy files and switch' }).click()
  await expect(move.getByRole('status')).toContainText(newDir)
  await expect(move.getByRole('status')).toContainText('1 file copied')
  expect(existsSync(song(newDir))).toBe(true)
  expect(existsSync(song(oldDir))).toBe(true) // still there until the user says so

  // the app now reads from the new folder
  const checks = await page.evaluate((songId) => window.api.library.checkSong(songId), id!)
  expect(checks.every((c) => c.exists)).toBe(true)

  await move.getByRole('button', { name: 'Remove old files' }).click()
  const back = page.getByRole('dialog', { name: 'Preferences' })
  await expect(back.getByTestId('path-Library folder')).toHaveText(newDir)
  expect(existsSync(song(oldDir))).toBe(false)
  expect(existsSync(song(newDir))).toBe(true)

  // remembered across a restart
  await app.close()
  ;({ app, page } = await launchApp(tmp))
  const ok = await page.evaluate((songId) => window.api.library.checkSong(songId), id!)
  expect(ok.every((c) => c.exists)).toBe(true)
  const after = await openPrefs('Locations')
  await expect(after.getByTestId('path-Library folder')).toHaveText(newDir)
})

test('a folder that already holds other files is refused', async () => {
  const busy = join(tmp, 'Music')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(busy)
  writeFileSync(join(busy, 'holiday.mp3'), 'x')
  await queueFilePicks(app, busy)
  const dialog = await openPrefs('Locations')
  await dialog.getByRole('button', { name: 'Change…' }).first().click()
  await expect(
    page.getByRole('dialog', { name: 'Library folder' }).getByRole('alert')
  ).toContainText('not empty')
})

test('the backup folder can be changed and a backup lands in it (BKP-1)', async () => {
  seedLibrary(tmp, [{ artist: 'B', album: 'A', title: 'Backed', playable: true }])
  const dir = join(tmp, 'my backups')
  await queueFilePicks(app, dir)
  const dialog = await openPrefs('Locations')
  await dialog.getByRole('button', { name: 'Change…' }).nth(1).click()
  await expect(dialog.getByTestId('path-Backup folder')).toHaveText(dir)
  await dialog.getByRole('button', { name: 'Close' }).click()

  await openFileMenu('Backup / Restore')
  const backup = page.getByRole('dialog', { name: 'Backup / Restore' })
  await backup.getByRole('button', { name: 'Back up now' }).click()
  await expect(backup.getByRole('status')).toContainText('Backup saved', { timeout: 30_000 })
  const files = readdirSync(dir)
  expect(files).toHaveLength(1)
  expect(files[0]).toMatch(/^TabKing-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/)
})

test('backup → wipe → restore brings the library back (BKP-1, BKP-2)', async () => {
  const [id] = seedLibrary(tmp, [
    { artist: 'Rush', album: 'Moving Pictures', title: 'YYZ', playable: true },
    { artist: 'Rush', album: 'Moving Pictures', title: 'Tom Sawyer', playable: true }
  ])
  await openFileMenu('Backup / Restore')
  const dialog = page.getByRole('dialog', { name: 'Backup / Restore' })
  await dialog.getByRole('button', { name: 'Back up now' }).click()
  await expect(dialog.getByRole('status')).toContainText('Backup saved', { timeout: 30_000 })
  const zip = (await dialog.getByRole('status').locator('code').textContent())!.trim()
  expect(existsSync(zip)).toBe(true)
  await dialog.getByRole('button', { name: 'Close' }).click()

  // wipe: delete every song and every library file behind the app's back
  const db = new Database(join(tmp, 'ud', 'library.db'))
  db.pragma('foreign_keys = ON')
  db.prepare('DELETE FROM song').run()
  db.prepare('DELETE FROM album').run()
  db.prepare('DELETE FROM artist').run()
  db.close()
  rmSync(join(tmp, 'ud', 'library', 'Rush'), { recursive: true })
  expect(await page.evaluate(() => window.api.library.listArtists())).toHaveLength(0)

  // restore: pick the archive, read the summary, confirm
  await queueFilePicks(app, zip)
  await openFileMenu('Backup / Restore')
  await dialog.getByRole('button', { name: 'Restore from backup…' }).click()
  await expect(dialog).toContainText('2 songs')
  await expect(dialog).toContainText('replaces all songs')
  const closed = app.waitForEvent('close')
  await dialog.getByRole('button', { name: 'Restore and restart' }).click()
  await closed

  ;({ app, page } = await launchApp(tmp))
  const artists = await page.evaluate(() => window.api.library.listArtists())
  expect(artists.map((a) => a.name)).toEqual(['Rush'])
  const checks = await page.evaluate((songId) => window.api.library.checkSong(songId), id!)
  expect(checks.every((c) => c.exists)).toBe(true)
  const hits = await page.evaluate(() => window.api.library.search('tom saw'))
  expect(hits.songs.map((s) => s.title)).toEqual(['Tom Sawyer'])
})

test('restore refuses a file that is not a Tab King backup and changes nothing', async () => {
  seedLibrary(tmp, [{ artist: 'Keep', album: 'A', title: 'Me', playable: true }])
  const junk = join(tmp, 'junk.zip')
  copyFileSync(resolve('tests/fixtures/master-24s.mp3'), junk)
  await queueFilePicks(app, junk)
  await openFileMenu('Backup / Restore')
  const dialog = page.getByRole('dialog', { name: 'Backup / Restore' })
  await dialog.getByRole('button', { name: 'Restore from backup…' }).click()
  await expect(dialog.getByRole('alert')).toContainText('not a valid backup')
  expect(await page.evaluate(() => window.api.library.listArtists())).toHaveLength(1)
})

test('Help Contents opens a right-hand flyout with topics (HLP-1)', async () => {
  await page.getByRole('menuitem', { name: 'Help', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Help Contents' }).click()
  const help = page.getByRole('dialog', { name: 'Help Contents' })
  await expect(help).toBeVisible()
  const box = (await help.boundingBox())!
  const winWidth = await page.evaluate(() => window.innerWidth)
  expect(box.x + box.width).toBeCloseTo(winWidth, 0) // docked to the right edge
  await expect(
    help.getByRole('navigation', { name: 'Help topics' }).getByRole('button')
  ).toHaveCount(12)

  await help.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  const article = help.getByRole('article', { name: 'Keyboard shortcuts' })
  await expect(article.getByRole('heading', { name: 'Menus and lists' })).toBeVisible()
  await expect(article.getByRole('cell', { name: 'Play / pause' })).toBeVisible()

  // topics link to each other
  await help.getByRole('button', { name: '← Contents' }).click()
  await help.getByRole('button', { name: 'Preferences', exact: true }).click()
  await help.getByRole('button', { name: 'Backup and restore' }).click()
  await expect(help.getByRole('article', { name: 'Backup and restore' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(help).toBeHidden()
})

let github: Server
let githubUrl: string
let latest = 'v99.0.0'
let status = 200

test.describe('About and update check (ABT-1, ABT-2)', () => {
  test.beforeEach(async () => {
    github = createServer((req, res) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          tag_name: latest,
          html_url: `https://github.com/pacificnm/tab-king/releases/tag/${latest}`
        })
      )
    })
    await new Promise<void>((r) => github.listen(0, '127.0.0.1', r))
    const addr = github.address()
    githubUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/latest`
    await app.close()
    ;({ app, page } = await launchApp(tmp, { TABKING_UPDATE_URL: githubUrl }))
    status = 200
  })
  test.afterEach(() => void github.close())

  async function openAbout(): Promise<ReturnType<Page['getByRole']>> {
    await page.getByRole('menuitem', { name: 'Help', exact: true }).click()
    await page.getByRole('menuitem', { name: 'About' }).click()
    return page.getByRole('dialog', { name: 'About Tab King' })
  }

  test('shows the version and license, and never contacts GitHub on its own', async () => {
    let hits = 0
    github.on('request', () => hits++)
    const about = await openAbout()
    const version = await page.evaluate(async () => (await window.api.app.getInfo()).version)
    await expect(about.getByTestId('about-version')).toHaveText(`Version ${version}`)
    await expect(about.getByRole('link', { name: 'Apache License 2.0' })).toBeVisible()
    await expect(about.getByRole('link', { name: 'Project page on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/pacificnm/tab-king'
    )
    await page.waitForTimeout(500)
    expect(hits).toBe(0)
  })

  test('reports a newer version with a link', async () => {
    latest = 'v99.0.0'
    const about = await openAbout()
    await about.getByRole('button', { name: 'Check for updates' }).click()
    const result = about.getByTestId('update-result')
    await expect(result).toContainText('Version 99.0.0 is available')
    await expect(result.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/pacificnm/tab-king/releases/tag/v99.0.0'
    )
  })

  test('reports up to date', async () => {
    const version = await page.evaluate(async () => (await window.api.app.getInfo()).version)
    latest = `v${version}`
    const about = await openAbout()
    await about.getByRole('button', { name: 'Check for updates' }).click()
    await expect(about.getByTestId('update-result')).toContainText("You're up to date")
  })

  test('shows an error inline when GitHub fails', async () => {
    status = 500
    const about = await openAbout()
    await about.getByRole('button', { name: 'Check for updates' }).click()
    await expect(about.getByRole('alert')).toContainText('error (500)')
  })
})

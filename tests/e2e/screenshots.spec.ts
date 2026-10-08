import { expect, test } from '@playwright/test'
import { mkdirSync, rmSync } from 'node:fs'
import { launchApp, makeTmp } from './helpers'
import { seedLibrary } from './seed'

// Regenerates the README screenshots: `SCREENSHOTS=1 npx playwright test tests/e2e/screenshots.spec.ts`.
test.skip(!process.env['SCREENSHOTS'], 'only run on request')

test('README screenshots', async () => {
  const out = 'docs/screenshots'
  mkdirSync(out, { recursive: true })
  const tmp = makeTmp()
  const { app, page } = await launchApp(tmp)
  try {
    seedLibrary(tmp, [
      { artist: 'Rush', album: 'Moving Pictures', title: 'Tom Sawyer', trackNo: 1, playable: true },
      { artist: 'Rush', album: 'Moving Pictures', title: 'YYZ', trackNo: 3, playable: true },
      { artist: 'Rush', album: '2112', title: '2112', trackNo: 1, playable: true },
      {
        artist: 'Metallica',
        album: 'Master of Puppets',
        title: 'Battery',
        trackNo: 1,
        playable: true
      }
    ])
    await page.evaluate(() => window.api.prefs.update({ theme: 'midnight' }))
    await page.getByRole('button', { name: 'Library menu' }).click()
    const tree = page.getByRole('tree', { name: 'Library' })
    await tree.getByRole('treeitem', { name: 'Artists' }).click()
    await tree.getByRole('treeitem', { name: /Rush/ }).click()
    await tree.getByRole('treeitem', { name: /Moving Pictures/ }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/library.png` })

    await tree.getByRole('treeitem', { name: /Tom Sawyer/ }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/song.png` })

    await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
    await expect(
      page.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' })
    ).toBeVisible({ timeout: 20_000 })
    await page.getByLabel('Player', { exact: true }).getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/player.png` })

    await page.getByRole('menuitem', { name: 'File', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Preferences', exact: true }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/preferences.png` })
    await page.keyboard.press('Escape')

    await page.getByRole('menuitem', { name: 'Help', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Help Contents' }).click()
    await page.getByRole('button', { name: 'Practice tools' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${out}/help.png` })
  } finally {
    await app.close().catch(() => undefined)
    rmSync(tmp, { recursive: true, force: true })
  }
})

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { launchApp, makeTmp } from './helpers'
import { seedMany } from './seed'

// Startup budget (NFR-2: interactive in < 3 s on x64). CI runners are slower and share a disk with the build,
// so the workflows pass a looser limit; the default is the requirement.
const BUDGET_MS = Number(process.env['TABKING_STARTUP_BUDGET_MS'] ?? 3000)

test('the app starts, is usable within the startup budget, and reports its version (NFR-2)', async () => {
  const tmp = makeTmp()
  const t0 = Date.now()
  const { app, page } = await launchApp(tmp)
  try {
    await expect(page.getByRole('button', { name: 'Add song…' })).toBeVisible({ timeout: 20_000 })
    const startupMs = Date.now() - t0
    console.log(`startup to interactive: ${startupMs} ms (budget ${BUDGET_MS} ms)`)
    expect(startupMs).toBeLessThan(BUDGET_MS)

    // Each step is bounded and logged, so a hang on one platform names the call that hung.
    const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
      console.log(`step: ${name}`)
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`step "${name}" did not finish in 15 s`)), 15_000)
        )
      ])
    }
    const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string })
      .version
    const info = await step('app.getInfo', () => page.evaluate(() => window.api.app.getInfo()))
    expect(info.version).toBe(version)
    // the database opened and migrated, and the window is not showing an error
    const artists = await step('library.listArtists', () =>
      page.evaluate(() => window.api.library.listArtists())
    )
    expect(artists).toEqual([])
    await step('menubar', () =>
      expect(page.getByRole('menubar'))
        .toBeVisible()
        .then(() => null)
    )
  } finally {
    console.log('step: close')
    await app.close().catch(() => undefined)
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('a 5,000-song library does not slow start-up down (NFR-2, NFR-3)', async () => {
  const tmp = makeTmp()
  let { app } = await launchApp(tmp)
  try {
    expect(seedMany(tmp, 500, 2, 5)).toBe(5000)
    await app.close()
    const t0 = Date.now()
    const second = await launchApp(tmp)
    app = second.app
    const page = second.page
    await expect(page.getByRole('button', { name: 'Add song…' })).toBeVisible({ timeout: 20_000 })
    const startupMs = Date.now() - t0
    console.log(`startup with 5,000 songs: ${startupMs} ms (budget ${BUDGET_MS} ms)`)
    expect(startupMs).toBeLessThan(BUDGET_MS)
  } finally {
    await app.close().catch(() => undefined)
    rmSync(tmp, { recursive: true, force: true })
  }
})

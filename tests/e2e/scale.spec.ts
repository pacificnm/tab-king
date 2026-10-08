import { expect, test } from '@playwright/test'
import { rmSync } from 'node:fs'
import { launchApp, makeTmp } from './helpers'
import { seedMany } from './seed'

/**
 * NFR-3: with 5,000 songs the tree and search respond in under 200 ms. Measured end to end in the real app: IPC round
 * trips for each query, then the visible UI (opening the Artists tree, and search-as-you-type including its 150 ms
 * debounce).
 */
const BUDGET_MS = 200

test('5,000 songs: tree and search stay responsive (NFR-3)', async () => {
  const tmp = makeTmp()
  const { app, page } = await launchApp(tmp)
  try {
    expect(seedMany(tmp, 500, 2, 5)).toBe(5000)

    const ipc = await page.evaluate(async () => {
      const lib = window.api.library
      const out: Record<string, number> = {}
      const time = async (name: string, fn: () => Promise<unknown>): Promise<void> => {
        const t0 = performance.now()
        await fn()
        out[name] = performance.now() - t0
      }
      let artists: Awaited<ReturnType<typeof lib.listArtists>> = []
      await time('listArtists', async () => void (artists = await lib.listArtists()))
      const mid = artists[250]!
      await time('listAlbums', () => lib.listAlbums(mid.id))
      await time('listSongsByArtist', () => lib.listSongsByArtist(mid.id))
      for (const q of ['a', 'artist', 'artist 42', 'song 4', 'rain', 'blues'])
        await time(`search "${q}"`, () => lib.search(q))
      return { out, artists: artists.length }
    })
    expect(ipc.artists).toBe(500)
    for (const [name, ms] of Object.entries(ipc.out)) {
      console.log(`${name}: ${ms.toFixed(1)} ms`)
      expect(ms, name).toBeLessThan(BUDGET_MS)
    }

    await page.getByRole('button', { name: 'Library menu' }).click()

    // Time inside the page, so Playwright's own polling and click latency are not part of the number.
    const ui = await page.evaluate(async () => {
      const waitFor = (selector: string): Promise<number> =>
        new Promise((resolve) => {
          const t0 = performance.now()
          const found = (): boolean => !!document.querySelector(selector)
          if (found()) return resolve(0)
          const obs = new MutationObserver(() => {
            if (found()) {
              obs.disconnect()
              resolve(performance.now() - t0)
            }
          })
          obs.observe(document.body, { childList: true, subtree: true })
        })

      // Opening the Artists tree: click -> first artist row in the DOM.
      const artists = document.querySelector<HTMLElement>('[data-row="nav:artists"]')!
      const treeDone = waitFor('[data-row^="artist:"]')
      artists.click()
      const tree = await treeDone

      // Search as you type: set the box, then wait for a result row that cannot have been there before.
      document.querySelector<HTMLElement>('[data-row="nav:search"]')!.click()
      await waitFor('input[aria-label="Search the library"]')
      const box = document.querySelector<HTMLInputElement>(
        'input[aria-label="Search the library"]'
      )!
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(box, 'night')
      const searchDone = waitFor('[role="listitem"][aria-label^="Song "][aria-label*="Night"]')
      box.dispatchEvent(new Event('input', { bubbles: true }))
      return { tree, search: await searchDone }
    })
    console.log(`open Artists tree (500 artists): ${ui.tree.toFixed(0)} ms`)
    console.log(
      `search results after typing (150 ms debounce included): ${ui.search.toFixed(0)} ms`
    )
    expect(ui.tree).toBeLessThan(BUDGET_MS)
    // The 150 ms debounce is deliberate; the response itself must still land within the budget after it.
    expect(ui.search).toBeLessThan(150 + BUDGET_MS)
  } finally {
    await app.close().catch(() => undefined)
    rmSync(tmp, { recursive: true, force: true })
  }
})

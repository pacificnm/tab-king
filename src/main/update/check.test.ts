import { describe, expect, it } from 'vitest'
import { checkForUpdates, type FetchLike } from './check'

const reply =
  (status: number, body: unknown): FetchLike =>
  async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  })
const release = (tag: string, url = 'https://github.com/pacificnm/tab-king/releases/tag/x') => ({
  tag_name: tag,
  html_url: url
})

describe('checkForUpdates', () => {
  it('reports a newer release with its link', async () => {
    const r = await checkForUpdates('0.7.0', reply(200, release('v0.8.0')))
    expect(r).toMatchObject({ status: 'available', latest: '0.8.0', current: '0.7.0' })
    expect(r.url).toBe('https://github.com/pacificnm/tab-king/releases/tag/x')
  })

  it('reports up to date for the same or an older release', async () => {
    expect((await checkForUpdates('0.7.0', reply(200, release('v0.7.0')))).status).toBe(
      'up-to-date'
    )
    expect((await checkForUpdates('1.0.0', reply(200, release('v0.9.0')))).status).toBe(
      'up-to-date'
    )
  })

  it('never hands out a link that is not on the project page', async () => {
    const r = await checkForUpdates(
      '0.1.0',
      reply(200, release('v0.2.0', 'https://evil.example/x'))
    )
    expect(r.url).toBe('https://github.com/pacificnm/tab-king/releases/latest')
  })

  it('turns failures into readable messages', async () => {
    await expect(checkForUpdates('0.7.0', reply(404, {}))).rejects.toThrow(/No releases/)
    await expect(checkForUpdates('0.7.0', reply(403, {}))).rejects.toThrow(/limiting/)
    await expect(checkForUpdates('0.7.0', reply(500, {}))).rejects.toThrow(/error \(500\)/)
    await expect(checkForUpdates('0.7.0', reply(200, { nope: 1 }))).rejects.toThrow(/understood/)
    await expect(checkForUpdates('0.7.0', reply(200, release('nightly')))).rejects.toThrow(
      /understood/
    )
    await expect(
      checkForUpdates('0.7.0', async () => {
        throw new Error('ENOTFOUND')
      })
    ).rejects.toThrow(/reach GitHub/)
  })
})

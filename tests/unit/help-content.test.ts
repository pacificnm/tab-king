import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseToc } from '../../src/renderer/src/features/help/toc'

const dir = join(__dirname, '../../resources/help')
const topics = parseToc(JSON.parse(readFileSync(join(dir, 'toc.json'), 'utf8')))

describe('bundled help (HLP-1)', () => {
  it('accepts the bundled table of contents, and every entry has a file', () => {
    expect(topics.length).toBeGreaterThanOrEqual(10)
    for (const t of topics)
      expect(() => readFileSync(join(dir, t.file), 'utf8'), t.id).not.toThrow()
  })

  it('only links to topics that exist', () => {
    const ids = new Set(topics.map((t) => t.id))
    for (const t of topics) {
      const text = readFileSync(join(dir, t.file), 'utf8')
      for (const m of text.matchAll(/\(help:([a-z0-9-]+)\)/g))
        expect(ids.has(m[1]!), `${t.file} → ${m[1]}`).toBe(true)
    }
  })
})

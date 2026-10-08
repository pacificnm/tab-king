import { describe, expect, it } from 'vitest'
import { parseToc } from './toc'

describe('parseToc', () => {
  it('keeps well-formed topics in order', () => {
    expect(
      parseToc([
        { id: 'a', title: ' A ', file: 'a.md' },
        { id: 'b-2', title: 'B', file: 'b-2.md' }
      ])
    ).toEqual([
      { id: 'a', title: 'A', file: 'a.md' },
      { id: 'b-2', title: 'B', file: 'b-2.md' }
    ])
  })

  it('drops bad shapes, duplicate ids and file names that could leave the help folder', () => {
    const bad = [
      null,
      'x',
      { id: 'a', title: 'A' },
      { id: 'A', title: 'A', file: 'a.md' },
      { id: 'c', title: 'C', file: '../c.md' },
      { id: 'd', title: 'D', file: 'd.txt' },
      { id: 'e', title: '  ', file: 'e.md' },
      { id: 'ok', title: 'OK', file: 'ok.md' },
      { id: 'ok', title: 'Again', file: 'again.md' }
    ]
    expect(parseToc(bad)).toEqual([{ id: 'ok', title: 'OK', file: 'ok.md' }])
    expect(parseToc({ not: 'an array' })).toEqual([])
  })
})

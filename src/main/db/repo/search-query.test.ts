import { describe, expect, it } from 'vitest'
import { buildFtsQuery, likePattern, searchTokens } from './search-query'

describe('searchTokens / buildFtsQuery', () => {
  it('splits into words and turns each into a quoted prefix term', () => {
    expect(searchTokens('  Tom   Sawyer! ')).toEqual(['Tom', 'Sawyer'])
    expect(buildFtsQuery('tom saw')).toBe('"tom"* "saw"*')
  })

  it('cannot be used to inject FTS syntax', () => {
    expect(buildFtsQuery('a" OR "b')).toBe('"a"* "OR"* "b"*')
    expect(buildFtsQuery('NEAR(x y) -z *')).toBe('"NEAR"* "x"* "y"* "z"*')
    expect(buildFtsQuery('col:title')).toBe('"col"* "title"*')
  })

  it('keeps accented and non-latin words, digits, and caps the number of words', () => {
    expect(searchTokens('Mötley Crüe 1981')).toEqual(['Mötley', 'Crüe', '1981'])
    expect(searchTokens('日本語 テスト')).toEqual(['日本語', 'テスト'])
    expect(searchTokens('a b c d e f g h i j')).toHaveLength(8)
  })

  it('returns null when there is nothing to search for', () => {
    for (const q of ['', '   ', '!!!', '"*"']) expect(buildFtsQuery(q)).toBeNull()
  })
})

describe('likePattern', () => {
  it('escapes LIKE wildcards', () => {
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%')
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
  })
})

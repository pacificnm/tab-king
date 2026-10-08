import { describe, expect, it } from 'vitest'
import { moveItem } from './PlaylistView'

describe('moveItem', () => {
  it('moves an element and returns a new array', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(list, 1, 2)).toEqual(['a', 'c', 'b', 'd'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves the list alone for no-op or out-of-range moves', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 1, 1)).toEqual(list)
    expect(moveItem(list, -1, 1)).toEqual(list)
    expect(moveItem(list, 0, 3)).toEqual(list)
    expect(moveItem([], 0, 0)).toEqual([])
  })
})

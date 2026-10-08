import { describe, expect, it } from 'vitest'
import { shortcutFor, type KeyInfo } from './shortcuts'

const el = (
  tagName: string,
  opts: { editable?: boolean; inside?: boolean } = {}
): KeyInfo['target'] => ({
  tagName,
  isContentEditable: !!opts.editable,
  closest: () => (opts.inside ? {} : null)
})
const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  defaultPrevented: false,
  target: el('BODY'),
  ...over
})

describe('shortcutFor', () => {
  it('maps the PLY-7 keys', () => {
    expect(shortcutFor(key(' '))).toBe('togglePlay')
    expect(shortcutFor(key('Home'))).toBe('restart')
    expect(shortcutFor(key('['))).toBe('speedDown')
    expect(shortcutFor(key(']'))).toBe('speedUp')
    expect(shortcutFor(key('l'))).toBe('toggleLoop')
    expect(shortcutFor(key('M'))).toBe('toggleMetronome')
    expect(shortcutFor(key('c'))).toBe('toggleCountIn')
    expect(shortcutFor(key('x'))).toBeNull()
  })

  it('stays out of the way while typing, in menus/trees/dialogs, or with modifiers', () => {
    expect(shortcutFor(key('m', { target: el('INPUT') }))).toBeNull()
    expect(shortcutFor(key('m', { target: el('DIV', { editable: true }) }))).toBeNull()
    expect(shortcutFor(key('Home', { target: el('DIV', { inside: true }) }))).toBeNull()
    expect(shortcutFor(key('c', { ctrlKey: true }))).toBeNull()
    expect(shortcutFor(key('l', { metaKey: true }))).toBeNull()
    expect(shortcutFor(key('l', { defaultPrevented: true }))).toBeNull()
  })

  it('lets a focused button handle Space itself', () => {
    expect(shortcutFor(key(' ', { target: el('BUTTON') }))).toBeNull()
    expect(shortcutFor(key('m', { target: el('BUTTON') }))).toBe('toggleMetronome')
  })
})

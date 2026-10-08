import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, MIN_WIDTH, sanitizeWindowState } from './window-state'

const display = { x: 0, y: 0, width: 1920, height: 1080 }

describe('sanitizeWindowState', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeWindowState(null, [display])).toEqual(DEFAULT_STATE)
    expect(sanitizeWindowState('x', [display])).toEqual(DEFAULT_STATE)
  })

  it('keeps a valid saved state', () => {
    const s = sanitizeWindowState({ x: 100, y: 50, width: 1000, height: 700, maximized: true }, [
      display
    ])
    expect(s).toEqual({ x: 100, y: 50, width: 1000, height: 700, maximized: true })
  })

  it('enforces minimum size', () => {
    expect(sanitizeWindowState({ width: 10, height: 10 }, [display]).width).toBe(MIN_WIDTH)
  })

  it('drops position when off every display', () => {
    const s = sanitizeWindowState({ x: 5000, y: 5000, width: 1000, height: 700 }, [display])
    expect(s.x).toBeUndefined()
    expect(s.y).toBeUndefined()
  })

  it('rejects non-numeric fields', () => {
    const s = sanitizeWindowState({ width: '1000', height: NaN, x: 'a' }, [display])
    expect(s.width).toBe(DEFAULT_STATE.width)
    expect(s.height).toBe(DEFAULT_STATE.height)
  })
})

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const DEFAULT_STATE: WindowState = { width: 1280, height: 800, maximized: false }
export const MIN_WIDTH = 900
export const MIN_HEIGHT = 600

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Coerce untrusted persisted data into a valid state; keep position only if still on a display. */
export function sanitizeWindowState(raw: unknown, displays: Rect[]): WindowState {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_STATE }
  const r = raw as Record<string, unknown>
  const width = isNum(r.width) ? Math.max(MIN_WIDTH, Math.round(r.width)) : DEFAULT_STATE.width
  const height = isNum(r.height) ? Math.max(MIN_HEIGHT, Math.round(r.height)) : DEFAULT_STATE.height
  const state: WindowState = { width, height, maximized: r.maximized === true }
  if (isNum(r.x) && isNum(r.y)) {
    const x = Math.round(r.x)
    const y = Math.round(r.y)
    const visible = displays.some(
      (d) => x + 100 > d.x && x < d.x + d.width - 100 && y >= d.y - 10 && y < d.y + d.height - 50
    )
    if (visible) {
      state.x = x
      state.y = y
    }
  }
  return state
}

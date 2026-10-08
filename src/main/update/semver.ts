const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export interface Semver {
  major: number
  minor: number
  patch: number
  pre: string[]
}

export function parseSemver(text: string): Semver | null {
  const m = SEMVER.exec(text.trim())
  if (!m) return null
  return { major: +m[1]!, minor: +m[2]!, patch: +m[3]!, pre: m[4] ? m[4].split('.') : [] }
}

/** Negative if a < b, 0 if equal, positive if a > b (semver precedence; build metadata ignored). */
export function compareSemver(a: Semver, b: Semver): number {
  for (const k of ['major', 'minor', 'patch'] as const) if (a[k] !== b[k]) return a[k] - b[k]
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length // a release beats its prereleases
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i]
    const y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      if (+x !== +y) return +x - +y
    } else if (nx !== ny) return nx ? -1 : 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

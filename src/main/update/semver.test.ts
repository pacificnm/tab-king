import { describe, expect, it } from 'vitest'
import { compareSemver, parseSemver } from './semver'

const cmp = (a: string, b: string): number => compareSemver(parseSemver(a)!, parseSemver(b)!)

describe('semver', () => {
  it('parses versions with an optional v and rejects junk', () => {
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] })
    expect(parseSemver('0.7.0-beta.1+build5')?.pre).toEqual(['beta', '1'])
    for (const bad of ['1.2', 'latest', '1.2.3.4', '', 'v1.x.0'])
      expect(parseSemver(bad)).toBeNull()
  })

  it('orders numerically, not as text', () => {
    expect(cmp('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(cmp('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(cmp('v0.7.0', '0.7.0')).toBe(0)
    expect(cmp('0.6.0', '0.7.0')).toBeLessThan(0)
  })

  it('puts prereleases before the release and orders them by identifier', () => {
    expect(cmp('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
    expect(cmp('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0)
    expect(cmp('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0)
    expect(cmp('1.0.0-alpha.2', '1.0.0-alpha.10')).toBeLessThan(0)
    expect(cmp('1.0.0-alpha.1', '1.0.0-beta')).toBeLessThan(0)
    expect(cmp('1.0.0-1', '1.0.0-a')).toBeLessThan(0)
  })
})

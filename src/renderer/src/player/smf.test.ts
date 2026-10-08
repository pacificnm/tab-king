import { describe, expect, it } from 'vitest'
import { parseSmf, scaleTick } from './smf'

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
const be16 = (n: number): number[] => [(n >> 8) & 255, n & 255]
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const track = (...data: number[]): number[] => [...ascii('MTrk'), ...be32(data.length), ...data]
const header = (format: number, tracks: number, division: number): number[] => [
  ...ascii('MThd'),
  ...be32(6),
  ...be16(format),
  ...be16(tracks),
  ...be16(division)
]
const smf = (...parts: number[][]): Uint8Array => new Uint8Array(parts.flat())

describe('parseSmf', () => {
  it('reads channel events with absolute ticks, running status and note-on velocity 0', () => {
    const t = track(
      0x00,
      0xff,
      0x51,
      0x03,
      0x07,
      0xa1,
      0x20, // tempo meta (skipped)
      0x00,
      0xc0,
      25, // program change ch0
      0x00,
      0xb0,
      7,
      100, // CC volume
      0x00,
      0x90,
      60,
      90, // note on
      0x60,
      60,
      0, // running status: note on vel 0 => off at tick 96
      0x00,
      0xe1,
      0x00,
      0x40, // pitch bend ch1
      0x00,
      0xff,
      0x2f,
      0x00 // end of track
    )
    const { division, events } = parseSmf(smf(header(0, 1, 480), t))
    expect(division).toBe(480)
    expect(events).toEqual([
      { kind: 'program', tick: 0, channel: 0, program: 25 },
      { kind: 'control', tick: 0, channel: 0, controller: 7, value: 100 },
      { kind: 'noteOn', tick: 0, channel: 0, key: 60, velocity: 90 },
      { kind: 'noteOff', tick: 96, channel: 0, key: 60, velocity: 0 },
      { kind: 'bend', tick: 96, channel: 1, value: 0x2000 }
    ])
  })

  it('merges tracks, ignores sysex and aftertouch, and puts note-offs before note-ons at the same tick', () => {
    const t1 = track(0x00, 0x90, 60, 80, 0x60, 0x80, 60, 0, 0x00, 0xff, 0x2f, 0x00)
    const t2 = track(
      0x00,
      0xf0,
      0x03,
      0x7e,
      0x7f,
      0xf7,
      0x60,
      0x91,
      62,
      70,
      0x00,
      0xa1,
      62,
      10,
      0x00,
      0xd1,
      5
    )
    const { events } = parseSmf(smf(header(1, 2, 96), t1, t2))
    expect(events.map((e) => [e.kind, e.tick])).toEqual([
      ['noteOn', 0],
      ['noteOff', 96],
      ['noteOn', 96]
    ])
  })

  it('skips unknown chunks and rejects bad input with readable errors', () => {
    const odd = [...ascii('JUNK'), ...be32(2), 1, 2]
    expect(parseSmf(smf(header(0, 2, 96), odd, track(0x00, 0x90, 60, 80))).events).toHaveLength(1)
    expect(() => parseSmf(new Uint8Array([1, 2, 3]))).toThrow('Not a MIDI file')
    expect(() => parseSmf(smf(header(2, 1, 96)))).toThrow('format 0 and 1')
    expect(() => parseSmf(smf(header(0, 1, 0x8000 | 25)))).toThrow('SMPTE')
    expect(() => parseSmf(smf(header(0, 1, 0)))).toThrow('division')
    expect(() => parseSmf(smf(header(0, 1, 96), track(0x00, 0x90, 60)))).toThrow()
    expect(() => parseSmf(smf(header(0, 1, 96), [...ascii('MTrk'), ...be32(50), 0]))).toThrow(
      'past the end'
    )
  })
})

describe('scaleTick', () => {
  it('converts between divisions', () => {
    expect(scaleTick(96, 96)).toBe(960)
    expect(scaleTick(240, 480)).toBe(480)
    expect(scaleTick(1, 3)).toBe(320)
  })
})

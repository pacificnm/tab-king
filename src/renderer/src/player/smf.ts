/** A channel event from a Standard MIDI File, with its absolute tick (in the file's own division). */
export type SmfEvent =
  | { kind: 'noteOn'; tick: number; channel: number; key: number; velocity: number }
  | { kind: 'noteOff'; tick: number; channel: number; key: number; velocity: number }
  | { kind: 'control'; tick: number; channel: number; controller: number; value: number }
  | { kind: 'program'; tick: number; channel: number; program: number }
  | { kind: 'bend'; tick: number; channel: number; value: number }

export interface ParsedSmf {
  division: number
  events: SmfEvent[]
}

class Reader {
  pos = 0
  constructor(private readonly b: Uint8Array) {}
  get done(): boolean {
    return this.pos >= this.b.length
  }
  u8(): number {
    const v = this.b[this.pos++]
    if (v === undefined) throw new Error('Unexpected end of MIDI data')
    return v
  }
  u16(): number {
    return (this.u8() << 8) | this.u8()
  }
  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0
  }
  vlq(): number {
    let v = 0
    for (let i = 0; i < 4; i++) {
      const b = this.u8()
      v = (v << 7) | (b & 0x7f)
      if (!(b & 0x80)) return v
    }
    throw new Error('Invalid variable-length value in MIDI data')
  }
  skip(n: number): void {
    if (this.pos + n > this.b.length) throw new Error('Unexpected end of MIDI data')
    this.pos += n
  }
  tag(): string {
    return String.fromCharCode(this.u8(), this.u8(), this.u8(), this.u8())
  }
}

/**
 * Parse the channel events of a Standard MIDI File (format 0 or 1, ticks-per-quarter timing).
 * Meta and system-exclusive events — including tempo — are skipped: the tab's own timeline is used.
 * Throws a readable error for anything that isn't a usable SMF.
 */
export function parseSmf(bytes: Uint8Array): ParsedSmf {
  const r = new Reader(bytes)
  if (bytes.length < 14 || r.tag() !== 'MThd') throw new Error('Not a MIDI file')
  const headerLen = r.u32()
  const format = r.u16()
  const trackCount = r.u16()
  const division = r.u16()
  r.skip(Math.max(0, headerLen - 6))
  if (format > 1) throw new Error('Only MIDI format 0 and 1 files are supported')
  if (division & 0x8000) throw new Error('MIDI files with SMPTE timing are not supported')
  if (division === 0) throw new Error('Invalid MIDI time division')

  const events: SmfEvent[] = []
  for (let t = 0; t < trackCount && !r.done; t++) {
    const tag = r.tag()
    const len = r.u32()
    const end = r.pos + len
    if (end > bytes.length) throw new Error('MIDI track extends past the end of the file')
    if (tag !== 'MTrk') {
      r.skip(len)
      continue
    }
    let tick = 0
    let running = 0
    while (r.pos < end) {
      tick += r.vlq()
      let status = r.u8()
      if (status < 0x80) {
        if (running === 0) throw new Error('Invalid running status in MIDI data')
        r.pos--
        status = running
      }
      if (status === 0xff) {
        r.u8() // meta type
        r.skip(r.vlq())
        continue
      }
      if (status === 0xf0 || status === 0xf7) {
        r.skip(r.vlq())
        continue
      }
      running = status
      const channel = status & 0x0f
      switch (status & 0xf0) {
        case 0x80:
          events.push({ kind: 'noteOff', tick, channel, key: r.u8(), velocity: r.u8() })
          break
        case 0x90: {
          const key = r.u8()
          const velocity = r.u8()
          // Note-on with velocity 0 is a note-off by convention.
          events.push(
            velocity === 0
              ? { kind: 'noteOff', tick, channel, key, velocity: 0 }
              : { kind: 'noteOn', tick, channel, key, velocity }
          )
          break
        }
        case 0xa0:
          r.skip(2) // polyphonic aftertouch
          break
        case 0xb0:
          events.push({ kind: 'control', tick, channel, controller: r.u8(), value: r.u8() })
          break
        case 0xc0:
          events.push({ kind: 'program', tick, channel, program: r.u8() })
          break
        case 0xd0:
          r.skip(1) // channel aftertouch
          break
        case 0xe0:
          events.push({ kind: 'bend', tick, channel, value: r.u8() | (r.u8() << 7) })
          break
        default:
          throw new Error('Unsupported event in MIDI data')
      }
    }
    r.pos = end
  }

  // Stable by tick; at the same tick note-offs go first so repeated notes retrigger cleanly.
  const order = (e: SmfEvent): number => (e.kind === 'noteOff' ? 0 : e.kind === 'noteOn' ? 2 : 1)
  events.sort((a, b) => a.tick - b.tick || order(a) - order(b))
  return { division, events }
}

/** Scale a tick from the file's division to alphaTab's (960 per quarter), rounded. */
export const scaleTick = (tick: number, division: number, targetDivision = 960): number =>
  Math.round((tick * targetDivision) / division)

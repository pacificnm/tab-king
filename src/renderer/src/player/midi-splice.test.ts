import { importer, midi, Settings } from '@coderline/alphatab'
import { describe, expect, it } from 'vitest'
import { spliceExternalMidi } from './midi-splice'
import type { ParsedSmf } from './smf'

function generated(): InstanceType<typeof midi.MidiFile> {
  const settings = new Settings()
  const imp = new importer.AlphaTexImporter()
  imp.initFromString('\\tempo 120 \\track "Lead" 3.3.4*4 | 3.3.4*4', settings)
  const file = new midi.MidiFile()
  new midi.MidiFileGenerator(
    imp.readScore(),
    settings,
    new midi.AlphaSynthMidiFileHandler(file)
  ).generate()
  return file
}
const all = (f: InstanceType<typeof midi.MidiFile>): InstanceType<typeof midi.MidiEvent>[] =>
  f.tracks.flatMap((t) => t.events)
const ofType = (f: InstanceType<typeof midi.MidiFile>, type: number): number =>
  all(f).filter((e) => e.type === type).length

const ext: ParsedSmf = {
  division: 480, // alphaTab uses 960: ticks must be doubled
  events: [
    { kind: 'program', tick: 0, channel: 3, program: 40 },
    { kind: 'noteOn', tick: 0, channel: 3, key: 99, velocity: 80 },
    { kind: 'noteOff', tick: 480, channel: 3, key: 99, velocity: 0 }
  ]
}

describe('spliceExternalMidi', () => {
  it('replaces the tab-derived notes with the external ones, rescaled to alphaTab ticks', () => {
    const file = generated()
    expect(ofType(file, midi.MidiEventType.NoteOn)).toBeGreaterThan(0)
    spliceExternalMidi(file, ext)

    const ons = all(file).filter(
      (e): e is InstanceType<typeof midi.NoteOnEvent> => e.type === midi.MidiEventType.NoteOn
    )
    expect(ons.map((e) => [e.noteKey, e.channel, e.tick])).toEqual([[99, 3, file.tickShift]])
    const offs = all(file).filter(
      (e): e is InstanceType<typeof midi.NoteOffEvent> => e.type === midi.MidiEventType.NoteOff
    )
    expect(offs.map((e) => [e.noteKey, e.tick])).toEqual([[99, 960 + file.tickShift]])
    const pcs = all(file).filter(
      (e): e is InstanceType<typeof midi.ProgramChangeEvent> =>
        e.type === midi.MidiEventType.ProgramChange
    )
    expect(pcs.map((e) => [e.channel, e.program])).toEqual([[3, 40]])
  })

  it("keeps the tab's tempo and time-signature events (the sequencer derives the metronome from them)", () => {
    const keep = [midi.MidiEventType.TempoChange, midi.MidiEventType.TimeSignature]
    const counts = keep.map((t) => ofType(generated(), t))
    expect(counts.every((c) => c > 0)).toBe(true)

    const file = generated()
    spliceExternalMidi(file, ext)
    expect(keep.map((t) => ofType(file, t))).toEqual(counts)
  })

  it('keeps events in tick order', () => {
    const file = generated()
    spliceExternalMidi(file, ext)
    const ticks = all(file).map((e) => e.tick)
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
  })

  it('a file with no usable notes silences the synth rather than throwing', () => {
    const file = generated()
    spliceExternalMidi(file, { division: 960, events: [] })
    expect(ofType(file, midi.MidiEventType.NoteOn)).toBe(0)
  })
})

import { midi } from '@coderline/alphatab'
import { scaleTick, type ParsedSmf } from './smf'

/** Event types that carry the notes/instrument setup; these come from the external file instead of the tab. */
const REPLACED = new Set<number>([
  midi.MidiEventType.NoteOn,
  midi.MidiEventType.NoteOff,
  midi.MidiEventType.ControlChange,
  midi.MidiEventType.ProgramChange,
  midi.MidiEventType.PitchBend,
  midi.MidiEventType.PerNotePitchBend
])

/**
 * Replace the tab-derived note events of alphaTab's generated MIDI with an attached MIDI file's (TRK-6),
 * on the tab's own timeline. Tempo, time signatures, the metronome and alphaTab's tick lookup are kept, so the
 * cursor, speed, loop and count-in keep working. Events are rescaled from the file's division to alphaTab's.
 */
export function spliceExternalMidi(file: InstanceType<typeof midi.MidiFile>, ext: ParsedSmf): void {
  for (const t of file.tracks) {
    const kept = t.events.filter((e) => !REPLACED.has(e.type))
    t.events.splice(0, t.events.length, ...kept)
  }
  for (const e of ext.events) {
    const tick = scaleTick(e.tick, ext.division) + file.tickShift
    switch (e.kind) {
      case 'noteOn':
        file.addEvent(new midi.NoteOnEvent(0, tick, e.channel, e.key, e.velocity))
        break
      case 'noteOff':
        file.addEvent(new midi.NoteOffEvent(0, tick, e.channel, e.key, e.velocity))
        break
      case 'control':
        file.addEvent(new midi.ControlChangeEvent(0, tick, e.channel, e.controller, e.value))
        break
      case 'program':
        file.addEvent(new midi.ProgramChangeEvent(0, tick, e.channel, e.program))
        break
      case 'bend':
        file.addEvent(new midi.PitchBendEvent(0, tick, e.channel, e.value))
        break
    }
  }
}

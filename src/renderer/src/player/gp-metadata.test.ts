import { exporter, importer, Settings } from '@coderline/alphatab'
import { describe, expect, it } from 'vitest'
import { instrumentName, readGpMetadata } from './gp-metadata'

function makeGp(tex: string): Uint8Array {
  const settings = new Settings()
  const imp = new importer.AlphaTexImporter()
  imp.initFromString(tex, settings)
  return new exporter.Gp7Exporter().export(imp.readScore(), settings)
}

describe('readGpMetadata', () => {
  it('reads title, artist, album and the track list', () => {
    const meta = readGpMetadata(
      makeGp(
        '\\title "YYZ" \\artist "Rush" \\album "Moving Pictures" \\track "Lead" 3.3.4*4 | 1.2.4*4 \\track "Bass" 1.3.1*4'
      )
    )
    expect(meta).toMatchObject({ title: 'YYZ', artist: 'Rush', album: 'Moving Pictures' })
    expect(meta.tracks.map((t) => [t.index, t.name])).toEqual([
      [0, 'Lead'],
      [1, 'Bass']
    ])
  })

  it('throws on a corrupt file', () => {
    expect(() => readGpMetadata(new Uint8Array([1, 2, 3, 4]))).toThrow()
  })

  it('maps programs to instrument families', () => {
    expect(instrumentName(25, false)).toBe('Guitar')
    expect(instrumentName(33, false)).toBe('Bass')
    expect(instrumentName(0, true)).toBe('Drums')
  })
})

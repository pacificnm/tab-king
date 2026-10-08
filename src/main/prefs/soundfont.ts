import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { sanitizeSegment } from '../library/store'

/** A SoundFont (.sf2, or the compressed .sf3) is a RIFF file whose form type is "sfbk". */
export function isSoundFont(file: string): boolean {
  if (!/^\.sf[23]$/i.test(extname(file))) return false
  const fd = openSync(file, 'r')
  try {
    const head = Buffer.alloc(12)
    return (
      readSync(fd, head, 0, 12, 0) === 12 &&
      head.toString('latin1', 0, 4) === 'RIFF' &&
      head.toString('latin1', 8, 12) === 'sfbk'
    )
  } finally {
    closeSync(fd)
  }
}

/** Copy a SoundFont into the app's soundfonts folder under a unique, safe name; returns that file name. */
export function importSoundFont(src: string, dir: string): string {
  if (!isSoundFont(src)) throw new Error('That file is not a SoundFont (.sf2 or .sf3).')
  mkdirSync(dir, { recursive: true })
  const ext = extname(src).toLowerCase()
  const stem = sanitizeSegment(basename(src, extname(src)), 'SoundFont')
  for (let n = 1; ; n++) {
    const name = `${stem}${n === 1 ? '' : ` (${n})`}${ext}`
    if (!existsSync(join(dir, name))) {
      copyFileSync(src, join(dir, name), 1)
      return name
    }
  }
}

import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { PickedFile } from '@shared/types'

/**
 * Files the user chose in the native picker. The renderer only receives opaque tokens, so it cannot
 * ask main to read or copy arbitrary paths.
 */
export class PickedFiles {
  private readonly files = new Map<string, string>()

  add(path: string): PickedFile {
    const token = randomUUID()
    this.files.set(token, path)
    return { token, name: basename(path) }
  }

  resolve(token: string): string {
    const p = this.files.get(token)
    if (!p) throw new Error('Unknown file selection; please pick the file again')
    return p
  }
}

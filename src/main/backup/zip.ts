import yauzl from 'yauzl'

export type { Entry, ZipFile } from 'yauzl'

const INVALID = 'That file is not a valid backup archive.'

export function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zip) =>
      err ? reject(new Error(INVALID)) : resolve(zip)
    )
  )
}

/** Visit every entry in order; `visit` may read the entry's stream, and the walk waits for it. */
export async function eachEntry(
  zip: yauzl.ZipFile,
  visit: (entry: yauzl.Entry) => Promise<void>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    zip.on('error', () => reject(new Error(INVALID)))
    zip.on('end', resolve)
    zip.on('entry', (entry: yauzl.Entry) => {
      visit(entry).then(() => zip.readEntry(), reject)
    })
    zip.readEntry()
  })
}

export function entryStream(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream)))
  )
}

export async function readEntryText(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  maxBytes: number
): Promise<string> {
  if (entry.uncompressedSize > maxBytes) throw new Error('Backup archive is malformed.')
  const stream = await entryStream(zip, entry)
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

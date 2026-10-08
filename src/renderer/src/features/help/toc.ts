export interface Topic {
  id: string
  title: string
  file: string
}

const ID = /^[a-z0-9-]{1,60}$/
const FILE = /^[a-z0-9-]{1,60}\.md$/

/** Validate `toc.json`: unknown shapes and unsafe file names are dropped rather than fetched. */
export function parseToc(json: unknown): Topic[] {
  if (!Array.isArray(json)) return []
  const seen = new Set<string>()
  const topics: Topic[] = []
  for (const t of json as unknown[]) {
    if (typeof t !== 'object' || t === null) continue
    const { id, title, file } = t as Record<string, unknown>
    if (typeof id !== 'string' || typeof title !== 'string' || typeof file !== 'string') continue
    if (!ID.test(id) || !FILE.test(file) || !title.trim() || seen.has(id)) continue
    seen.add(id)
    topics.push({ id, title: title.trim(), file })
  }
  return topics
}

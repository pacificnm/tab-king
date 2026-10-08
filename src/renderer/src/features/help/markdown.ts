/**
 * A deliberately small Markdown reader for the bundled help topics (HLP-1): headings, paragraphs, bullet and numbered
 * lists, fenced code, block quotes, pipe tables, and **bold**, *italic*, `code` and [links](url) inline. It produces data
 * (never HTML), and only `https:` and `help:` links survive, so topic text can't inject anything.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; children: Inline[] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }

const SAFE_LINK = /^(https:\/\/[^\s]+|help:[a-z0-9-]+)$/

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = (): void => {
    if (text) out.push({ kind: 'text', text })
    text = ''
  }
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if ((m = /^`([^`]+)`/.exec(rest))) {
      flush()
      out.push({ kind: 'code', text: m[1]! })
    } else if ((m = /^\*\*([^*]+)\*\*/.exec(rest))) {
      flush()
      out.push({ kind: 'strong', children: parseInline(m[1]!) })
    } else if ((m = /^\*([^*\s][^*]*)\*/.exec(rest))) {
      flush()
      out.push({ kind: 'em', children: parseInline(m[1]!) })
    } else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) {
      flush()
      const children = parseInline(m[1]!)
      if (SAFE_LINK.test(m[2]!)) out.push({ kind: 'link', href: m[2]!, children })
      else out.push(...children)
    } else {
      text += src[i]
      i++
      continue
    }
    i += m[0].length
  }
  flush()
  return out
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

const isTableRule = (line: string): boolean =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i++
      continue
    }
    const fence = /^```/.exec(line)
    if (fence) {
      const code: string[] = []
      for (i++; i < lines.length && !/^```/.test(lines[i]!); i++) code.push(lines[i]!)
      i++ // closing fence
      blocks.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({
        kind: 'heading',
        level: h[1]!.length as 1 | 2 | 3,
        children: parseInline(h[2]!.trim())
      })
      i++
      continue
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = []
      for (; i < lines.length && /^\s*>\s?/.test(lines[i]!); i++)
        quote.push(lines[i]!.replace(/^\s*>\s?/, ''))
      blocks.push({ kind: 'quote', children: parseInline(quote.join(' ')) })
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1]!)) {
      const header = splitRow(line).map(parseInline)
      const rows: Inline[][][] = []
      for (i += 2; i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== ''; i++)
        rows.push(splitRow(lines[i]!).map(parseInline))
      blocks.push({ kind: 'table', header, rows })
      continue
    }
    const bullet = /^\s*[-*]\s+/
    const numbered = /^\s*\d+[.)]\s+/
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line)
      const marker = ordered ? numbered : bullet
      const items: Inline[][] = []
      for (; i < lines.length && marker.test(lines[i]!); i++) {
        let item = lines[i]!.replace(marker, '')
        // a wrapped continuation line is indented and belongs to the same item
        while (
          i + 1 < lines.length &&
          /^\s{2,}\S/.test(lines[i + 1]!) &&
          !marker.test(lines[i + 1]!)
        ) {
          item += ` ${lines[++i]!.trim()}`
        }
        items.push(parseInline(item))
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    const para: string[] = []
    for (
      ;
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(#{1,3}\s|```|\s*>|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i]!);
      i++
    )
      para.push(lines[i]!.trim())
    blocks.push({ kind: 'paragraph', children: parseInline(para.join(' ')) })
  }
  return blocks
}

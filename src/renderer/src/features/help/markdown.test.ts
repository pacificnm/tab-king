import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

const text = (t: string) => ({ kind: 'text', text: t })

describe('parseInline', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      text('a '),
      { kind: 'strong', children: [text('b')] },
      text(' '),
      { kind: 'em', children: [text('c')] },
      text(' '),
      { kind: 'code', text: 'd' }
    ])
  })

  it('keeps https and help links and drops everything else to plain text', () => {
    expect(parseInline('[site](https://example.com/x) [topic](help:backup-restore)')).toEqual([
      { kind: 'link', href: 'https://example.com/x', children: [text('site')] },
      text(' '),
      { kind: 'link', href: 'help:backup-restore', children: [text('topic')] }
    ])
    for (const bad of [
      'javascript:alert(1)',
      'http://plain.example',
      'file:///etc/passwd',
      'data:text/html,x'
    ]) {
      const nodes = parseInline(`[click](${bad})`)
      expect(
        nodes.some((n) => n.kind === 'link'),
        bad
      ).toBe(false)
      expect(nodes[0]).toEqual(text('click'))
    }
  })

  it('never produces raw HTML — angle brackets stay text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      text('<img src=x onerror=alert(1)>')
    ])
  })

  it('treats an unmatched marker as text', () => {
    expect(parseInline('2 * 3 and `open')).toEqual([text('2 * 3 and `open')])
  })
})

describe('parseMarkdown', () => {
  it('parses headings, paragraphs (joining wrapped lines) and quotes', () => {
    expect(parseMarkdown('# Title\n\nfirst line\nsecond line\n\n> note\n> more')).toEqual([
      { kind: 'heading', level: 1, children: [text('Title')] },
      { kind: 'paragraph', children: [text('first line second line')] },
      { kind: 'quote', children: [text('note more')] }
    ])
  })

  it('parses bullet and numbered lists with wrapped items', () => {
    expect(parseMarkdown('- one\n  still one\n- two\n\n1. a\n2. b')).toEqual([
      { kind: 'list', ordered: false, items: [[text('one still one')], [text('two')]] },
      { kind: 'list', ordered: true, items: [[text('a')], [text('b')]] }
    ])
  })

  it('parses fenced code without interpreting its contents', () => {
    expect(parseMarkdown('```\n# not a heading\n**raw**\n```')).toEqual([
      { kind: 'code', text: '# not a heading\n**raw**' }
    ])
  })

  it('parses pipe tables', () => {
    const [t] = parseMarkdown('| Key | Action |\n|---|---|\n| `Space` | Play |\n| `L` | Loop |')
    expect(t).toMatchObject({ kind: 'table' })
    expect(t).toHaveProperty('rows.length', 2)
    expect(t).toHaveProperty('header.0.0', text('Key'))
  })
})

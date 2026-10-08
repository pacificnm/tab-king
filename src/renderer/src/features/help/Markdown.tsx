import { parseMarkdown, type Block, type Inline } from './markdown'

interface Props {
  source: string
  /** Called for `help:<topic>` links. */
  onTopic: (id: string) => void
}

function Inlines({
  nodes,
  onTopic
}: {
  nodes: Inline[]
  onTopic: (id: string) => void
}): React.JSX.Element {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return n.text
          case 'strong':
            return (
              <strong key={i}>
                <Inlines nodes={n.children} onTopic={onTopic} />
              </strong>
            )
          case 'em':
            return (
              <em key={i}>
                <Inlines nodes={n.children} onTopic={onTopic} />
              </em>
            )
          case 'code':
            return (
              <code key={i} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">
                {n.text}
              </code>
            )
          case 'link':
            return n.href.startsWith('help:') ? (
              <button
                key={i}
                type="button"
                className="text-accent underline"
                onClick={() => onTopic(n.href.slice('help:'.length))}
              >
                <Inlines nodes={n.children} onTopic={onTopic} />
              </button>
            ) : (
              // Opens in the system browser: the main process routes https window.open calls out of the app.
              <a
                key={i}
                href={n.href}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                <Inlines nodes={n.children} onTopic={onTopic} />
              </a>
            )
        }
      })}
    </>
  )
}

function BlockView({
  block,
  onTopic
}: {
  block: Block
  onTopic: (id: string) => void
}): React.JSX.Element {
  const inl = (nodes: Inline[]): React.JSX.Element => <Inlines nodes={nodes} onTopic={onTopic} />
  switch (block.kind) {
    case 'heading':
      return block.level === 1 ? (
        <h2 className="mb-1 mt-0 text-lg font-semibold">{inl(block.children)}</h2>
      ) : block.level === 2 ? (
        <h3 className="mt-3 text-base font-semibold">{inl(block.children)}</h3>
      ) : (
        <h4 className="mt-2 text-sm font-semibold">{inl(block.children)}</h4>
      )
    case 'paragraph':
      return <p className="leading-relaxed">{inl(block.children)}</p>
    case 'quote':
      return (
        <blockquote className="border-l-2 border-accent pl-3 text-fg-muted">
          {inl(block.children)}
        </blockquote>
      )
    case 'code':
      return (
        <pre className="select-text overflow-x-auto rounded border border-border bg-bg p-2 text-xs">
          {block.text}
        </pre>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag className={`${block.ordered ? 'list-decimal' : 'list-disc'} flex flex-col gap-1 pl-5`}>
          {block.items.map((item, i) => (
            <li key={i}>{inl(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {block.header.map((c, i) => (
                <th key={i} className="border-b border-border py-1 pr-3 font-semibold">
                  {inl(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i} className="border-b border-border/50 py-1 pr-3 align-top">
                    {inl(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
  }
}

/** Renders one help topic. Content is parsed to data and rendered through React, never as HTML. */
export function Markdown({ source, onTopic }: Props): React.JSX.Element {
  return (
    <div className="flex select-text flex-col gap-3 text-sm">
      {parseMarkdown(source).map((b, i) => (
        <BlockView key={i} block={b} onTopic={onTopic} />
      ))}
    </div>
  )
}

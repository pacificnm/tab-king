import { useEffect, useRef, useState } from 'react'
import { Flyout } from '../../components/Flyout'
import { btn } from '../../components/Modal'
import { Markdown } from './Markdown'
import { parseToc, type Topic } from './toc'

const HELP_URL = 'tabking://app/help/'

async function fetchText(file: string): Promise<string> {
  const res = await fetch(HELP_URL + file)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** Help → Help Contents (HLP-1): a right-hand flyout with a table of contents and the selected bundled topic. */
export function HelpFlyout({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const [toc, setToc] = useState<Topic[] | null>(null)
  const [topic, setTopic] = useState<Topic | null>(null)
  const [body, setBody] = useState<
    { id: string; text: string } | { id: string; error: true } | null
  >(null)
  const article = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || toc) return
    let live = true
    fetchText('toc.json')
      .then((t) => live && setToc(parseToc(JSON.parse(t))))
      .catch(() => live && setToc([]))
    return () => {
      live = false
    }
  }, [open, toc])

  useEffect(() => {
    if (!topic) return
    let live = true
    fetchText(topic.file)
      .then((text) => live && setBody({ id: topic.id, text }))
      .catch(() => live && setBody({ id: topic.id, error: true }))
    return () => {
      live = false
    }
  }, [topic])

  useEffect(() => {
    article.current?.scrollTo({ top: 0 })
  }, [topic])

  const showTopic = (id: string): void => {
    const next = toc?.find((t) => t.id === id)
    if (next) setTopic(next)
  }
  const loaded = topic && body?.id === topic.id ? body : null

  return (
    <Flyout open={open} side="right" label="Help Contents" onClose={onClose} width="w-[28rem]">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {topic && (
            <button type="button" className={btn} onClick={() => setTopic(null)}>
              ← Contents
            </button>
          )}
          <h2 className="flex-1 truncate text-base font-semibold">
            {topic?.title ?? 'Help Contents'}
          </h2>
          <button type="button" className={btn} aria-label="Close help" onClick={onClose}>
            ✕
          </button>
        </div>
        <div ref={article} className="min-h-0 flex-1 overflow-y-auto p-4">
          {!topic ? (
            toc === null ? (
              <p className="text-fg-muted">Loading…</p>
            ) : toc.length === 0 ? (
              <p role="alert" className="text-danger">
                The help topics could not be loaded.
              </p>
            ) : (
              <nav aria-label="Help topics">
                <ul className="flex flex-col">
                  {toc.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => setTopic(t)}
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )
          ) : loaded === null ? (
            <p className="text-fg-muted">Loading…</p>
          ) : 'error' in loaded ? (
            <p role="alert" className="text-danger">
              This topic could not be loaded.
            </p>
          ) : (
            <article aria-label={topic.title}>
              <Markdown source={loaded.text} onTopic={showTopic} />
            </article>
          )}
        </div>
      </div>
    </Flyout>
  )
}

import { useEffect, useState } from 'react'
import type { UpdateCheck } from '@shared/types'
import { btn, btnPrimary, Modal } from '../../components/Modal'

const REPO = 'https://github.com/pacificnm/tab-king'

type Check =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; result: UpdateCheck }
  | { kind: 'error'; message: string }

const Link = ({
  href,
  children
}: {
  href: string
  children: React.ReactNode
}): React.JSX.Element => (
  <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
    {children}
  </a>
)

/** Help → About (ABT-1) with a user-initiated update check (ABT-2). */
export function AboutDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [check, setCheck] = useState<Check>({ kind: 'idle' })

  useEffect(() => {
    void window.api.app.getInfo().then((i) => setVersion(i.version))
  }, [])

  const run = async (): Promise<void> => {
    setCheck({ kind: 'checking' })
    const r = await window.api.app.checkForUpdates()
    setCheck(r.ok ? { kind: 'done', result: r.value } : { kind: 'error', message: r.error })
  }

  return (
    <Modal title="About Tab King" onClose={onClose}>
      <div className="flex flex-col gap-4 px-5 py-4 text-sm">
        <div>
          <p className="text-lg font-semibold">Tab King</p>
          <p data-testid="about-version">Version {version || '…'}</p>
          <p className="mt-2 text-fg-muted">
            A guitar tab player for Guitar Pro files, with synced MP3 audio. Works offline;
            everything stays on your computer.
          </p>
        </div>

        <ul className="flex flex-col gap-1">
          <li>
            License: <Link href={`${REPO}/blob/main/LICENSE`}>Apache License 2.0</Link>
          </li>
          <li>Copyright © 2026 Jaimie Garner</li>
          <li>
            <Link href={REPO}>Project page on GitHub</Link>
          </li>
          <li>
            <Link href={`${REPO}/issues`}>Report a problem or request a feature</Link>
          </li>
          <li>
            <Link href={`${REPO}/blob/main/NOTICE`}>Third-party notices</Link>
          </li>
        </ul>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div>
            <button
              type="button"
              className={btn}
              disabled={check.kind === 'checking'}
              onClick={() => void run()}
            >
              {check.kind === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
          <div role="status" aria-live="polite" data-testid="update-result">
            {check.kind === 'done' && check.result.status === 'up-to-date' && (
              <p>You&apos;re up to date (version {check.result.current}).</p>
            )}
            {check.kind === 'done' && check.result.status === 'available' && (
              <p>
                Version {check.result.latest} is available (you have {check.result.current}).{' '}
                <Link href={check.result.url}>View the release and download it</Link>
              </p>
            )}
          </div>
          {check.kind === 'error' && (
            <p role="alert" className="text-danger">
              {check.message}
            </p>
          )}
          <p className="text-xs text-fg-muted">
            Tab King only contacts GitHub when you press this button. Updates are never installed
            automatically.
          </p>
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <button type="button" className={btnPrimary} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

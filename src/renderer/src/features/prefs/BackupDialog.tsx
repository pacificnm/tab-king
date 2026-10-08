import { useEffect, useState } from 'react'
import type { BackupManifest, BackupResult, RestorePlan, TaskProgress } from '@shared/types'
import { btn, btnPrimary, Modal } from '../../components/Modal'
import { usePrefsStore } from '../../prefs/store'
import { formatBytes } from './format'

type Stage =
  | { kind: 'idle' }
  | { kind: 'backing-up' }
  | { kind: 'backed-up'; result: BackupResult }
  | { kind: 'choosing' }
  | { kind: 'confirm'; plan: RestorePlan }
  | { kind: 'restoring' }
  | { kind: 'restarting' }

const when = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function ManifestSummary({ m }: { m: BackupManifest }): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      <dt className="text-fg-muted">Made</dt>
      <dd>{when(m.createdAt)}</dd>
      <dt className="text-fg-muted">Tab King</dt>
      <dd>{m.appVersion}</dd>
      <dt className="text-fg-muted">Contents</dt>
      <dd>
        {m.songCount} {m.songCount === 1 ? 'song' : 'songs'}, {m.fileCount}{' '}
        {m.fileCount === 1 ? 'file' : 'files'}
      </dd>
    </dl>
  )
}

/** File → Backup / Restore (BKP-1/2). */
export function BackupDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const backupDir = usePrefsStore((s) => s.view?.locations.backupDir)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<TaskProgress | null>(null)
  const busy =
    stage.kind === 'backing-up' || stage.kind === 'restoring' || stage.kind === 'restarting'

  useEffect(() => window.api.app.onProgress(setProgress), [])

  const backUp = async (): Promise<void> => {
    setError(null)
    setProgress(null)
    setStage({ kind: 'backing-up' })
    const r = await window.api.backup.create()
    if (r.ok) setStage({ kind: 'backed-up', result: r.value })
    else {
      setError(r.error)
      setStage({ kind: 'idle' })
    }
  }

  const choose = async (): Promise<void> => {
    setError(null)
    setStage({ kind: 'choosing' })
    const r = await window.api.backup.choose()
    if (!r.ok) {
      setError(r.error)
      setStage({ kind: 'idle' })
    } else setStage(r.value ? { kind: 'confirm', plan: r.value } : { kind: 'idle' })
  }

  const restore = async (plan: RestorePlan): Promise<void> => {
    setError(null)
    setProgress(null)
    setStage({ kind: 'restoring' })
    const r = await window.api.backup.restore(plan.token)
    if (r.ok) setStage({ kind: 'restarting' })
    else {
      setError(r.error)
      setStage({ kind: 'idle' })
    }
  }

  return (
    <Modal title="Backup / Restore" onClose={busy ? () => {} : onClose}>
      <div className="flex flex-col gap-4 px-5 py-4 text-sm">
        {stage.kind === 'idle' ||
        stage.kind === 'backing-up' ||
        stage.kind === 'backed-up' ||
        stage.kind === 'choosing' ? (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">Back up</h3>
              <p className="text-fg-muted">
                Saves your database and every library file in one .zip file in{' '}
                <code className="select-text break-all text-xs text-fg">{backupDir}</code>.
              </p>
              <div>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || stage.kind === 'choosing'}
                  onClick={() => void backUp()}
                >
                  {stage.kind === 'backing-up' ? 'Backing up…' : 'Back up now'}
                </button>
              </div>
              {stage.kind === 'backing-up' && (
                <progress
                  aria-label="Backup progress"
                  className="w-full"
                  max={progress?.total || undefined}
                  value={progress ? progress.done : undefined}
                />
              )}
              {stage.kind === 'backed-up' && (
                <p role="status">
                  Backup saved ({formatBytes(stage.result.bytes)}):
                  <code className="mt-1 block select-text break-all rounded border border-border bg-bg px-2 py-1.5 text-xs">
                    {stage.result.path}
                  </code>
                </p>
              )}
            </section>
            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="font-semibold">Restore</h3>
              <p className="text-fg-muted">
                Replaces your whole library with the contents of a backup, then restarts Tab King.
              </p>
              <div>
                <button
                  type="button"
                  className={btn}
                  disabled={busy || stage.kind === 'choosing'}
                  onClick={() => void choose()}
                >
                  Restore from backup…
                </button>
              </div>
            </section>
          </>
        ) : null}
        {stage.kind === 'confirm' && (
          <>
            <p>
              Restore <strong>{stage.plan.fileName}</strong> ({formatBytes(stage.plan.bytes)})?
            </p>
            <ManifestSummary m={stage.plan.manifest} />
            <p className="rounded border border-danger p-3 text-danger">
              This replaces all songs, play lists and files currently in your library. Make a backup
              first if you may want them back.
            </p>
          </>
        )}
        {stage.kind === 'restoring' && (
          <div role="status">
            <p>{progress?.label || 'Restoring…'}</p>
            <progress
              aria-label="Restore progress"
              className="mt-2 w-full"
              max={progress?.total || undefined}
              value={progress ? progress.done : undefined}
            />
          </div>
        )}
        {stage.kind === 'restarting' && <p role="status">Restore complete. Restarting Tab King…</p>}
        <p role="alert" className="text-danger">
          {error}
        </p>
      </div>
      <div className="flex justify-end gap-3 border-t border-border px-5 py-3">
        {stage.kind === 'confirm' ? (
          <>
            <button type="button" className={btn} onClick={() => setStage({ kind: 'idle' })}>
              Cancel
            </button>
            <button
              type="button"
              className={`${btnPrimary} !bg-danger !text-white`}
              onClick={() => void restore(stage.plan)}
            >
              Restore and restart
            </button>
          </>
        ) : (
          <button type="button" className={btn} disabled={busy} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </Modal>
  )
}

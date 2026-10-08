import { useEffect, useRef, useState } from 'react'
import type { LibraryMoveResult, LibraryPlan, TaskProgress } from '@shared/types'
import { btn, btnPrimary, Modal } from '../../components/Modal'
import { formatBytes } from './format'

type Stage =
  | { kind: 'choosing' }
  | { kind: 'plan'; plan: LibraryPlan }
  | { kind: 'working'; plan: LibraryPlan; progress: TaskProgress | null }
  | { kind: 'done'; result: LibraryMoveResult }
  | { kind: 'error'; message: string }

/**
 * Change the library folder (PRF-2): pick a folder, decide whether to copy the files across, then offer to remove the
 * old copies. The old files are only ever removed after the copy has been verified and the user says so.
 */
export function LibraryMoveDialog({
  useDefault,
  onClose
}: {
  useDefault: boolean
  onClose: () => void
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>({ kind: 'choosing' })
  const asked = useRef(false)

  useEffect(() => {
    if (asked.current) return // dev-mode double effects must not open two pickers
    asked.current = true
    void window.api.prefs.chooseLibraryDir(useDefault).then((r) => {
      if (!r.ok) setStage({ kind: 'error', message: r.error })
      else if (r.value === null) onClose()
      else setStage({ kind: 'plan', plan: r.value })
    })
  }, [useDefault, onClose])

  useEffect(() => {
    if (stage.kind !== 'working') return
    return window.api.app.onProgress((p) => {
      if (p.task === 'migrate') setStage((s) => (s.kind === 'working' ? { ...s, progress: p } : s))
    })
  }, [stage.kind])

  const apply = async (plan: LibraryPlan, migrate: boolean): Promise<void> => {
    setStage({ kind: 'working', plan, progress: null })
    const r = await window.api.prefs.applyLibraryDir(plan.token, migrate)
    setStage(r.ok ? { kind: 'done', result: r.value } : { kind: 'error', message: r.error })
  }

  const removeOld = async (): Promise<void> => {
    const r = await window.api.prefs.removeOldLibrary()
    if (r.ok) onClose()
    else setStage({ kind: 'error', message: r.error })
  }

  return (
    <Modal title="Library folder" onClose={stage.kind === 'working' ? () => {} : onClose}>
      <div className="flex flex-col gap-3 px-5 py-4 text-sm">
        {stage.kind === 'choosing' && <p>Waiting for you to choose a folder…</p>}

        {stage.kind === 'plan' && (
          <>
            <p>
              New library folder:
              <code className="mt-1 block select-text break-all rounded border border-border bg-bg px-2 py-1.5 text-xs">
                {stage.plan.path}
              </code>
            </p>
            {stage.plan.mode === 'existing' ? (
              <p>
                This folder already holds a Tab King library, so it will be used as it is. Songs in
                your database that are not in it will show as missing.
              </p>
            ) : (
              <p>
                Copy your {stage.plan.fileCount} library{' '}
                {stage.plan.fileCount === 1 ? 'file' : 'files'} ({formatBytes(stage.plan.bytes)})
                into the new folder? The originals stay where they are until you choose to remove
                them.
              </p>
            )}
          </>
        )}

        {stage.kind === 'working' && (
          <div>
            <p>{stage.progress?.label || 'Working…'}</p>
            <progress
              className="mt-2 w-full"
              aria-label="Copy progress"
              max={stage.progress?.total || undefined}
              value={stage.progress ? stage.progress.done : undefined}
            />
          </div>
        )}

        {stage.kind === 'done' && (
          <>
            <p role="status">
              The library now lives in {stage.result.view.locations.libraryDir}
              {stage.result.copied > 0 &&
                ` — ${stage.result.copied} ${stage.result.copied === 1 ? 'file' : 'files'} copied`}
              .
            </p>
            {stage.result.canRemoveOld && (
              <p>Remove the old copies from the previous folder to free up space?</p>
            )}
          </>
        )}

        {stage.kind === 'error' && (
          <p role="alert" className="text-danger">
            {stage.message}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-border px-5 py-3">
        {stage.kind === 'plan' && (
          <>
            <button type="button" className={btn} onClick={onClose}>
              Cancel
            </button>
            {stage.plan.mode === 'empty' && (
              <button type="button" className={btn} onClick={() => void apply(stage.plan, false)}>
                Switch without copying
              </button>
            )}
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void apply(stage.plan, stage.plan.mode === 'empty')}
            >
              {stage.plan.mode === 'empty' ? 'Copy files and switch' : 'Use this folder'}
            </button>
          </>
        )}
        {stage.kind === 'done' && stage.result.canRemoveOld && (
          <>
            <button type="button" className={btn} onClick={onClose}>
              Keep old files
            </button>
            <button type="button" className={btnPrimary} onClick={() => void removeOld()}>
              Remove old files
            </button>
          </>
        )}
        {stage.kind === 'done' && !stage.result.canRemoveOld && (
          <button type="button" className={btnPrimary} onClick={onClose}>
            Done
          </button>
        )}
        {stage.kind === 'error' && (
          <button type="button" className={btn} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </Modal>
  )
}

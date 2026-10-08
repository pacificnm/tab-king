import { useCallback, useReducer, useState } from 'react'
import { type Song } from '@shared/types'
import { btn, btnPrimary, input, Modal } from '../../components/Modal'
import {
  NO_SLOT,
  applyGp,
  applyId3,
  canSave,
  editField,
  emptyState,
  stateFromSong,
  toSongForm,
  type FormState,
  type Slot,
  type TextField
} from './song-form'
import { Cover } from '../../components/Cover'

type Props =
  | {
      mode: 'add'
      preset?: { artist?: string; album?: string }
      onClose: () => void
      onSaved: (song: Song) => void
    }
  | { mode: 'edit'; song: Song; onClose: () => void; onSaved: (song: Song) => void }

type Action = { type: 'set'; fn: (s: FormState) => FormState }
const reducer = (s: FormState, a: Action): FormState => a.fn(s)

const FIELD_LABELS: { key: TextField; label: string; inputMode?: 'numeric'; narrow?: boolean }[] = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'year', label: 'Year', inputMode: 'numeric', narrow: true },
  { key: 'trackNo', label: 'Track no.', inputMode: 'numeric', narrow: true },
  { key: 'genre', label: 'Genre' }
]

function FileRow({
  label,
  slot,
  required,
  onPick,
  onClear
}: {
  label: string
  slot: Slot
  required?: boolean
  onPick: () => void
  onClear?: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-sm">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-sm ${slot.kind === 'none' ? 'text-fg-muted' : ''}`}
        title={slot.kind === 'none' ? '' : slot.name}
      >
        {slot.kind === 'none' ? 'None' : slot.name}
      </span>
      <button type="button" className={btn} onClick={onPick}>
        {slot.kind === 'none' ? 'Choose…' : 'Replace…'}
      </button>
      {onClear && slot.kind !== 'none' && (
        <button type="button" className={btn} onClick={onClear} aria-label={`Remove ${label}`}>
          Remove
        </button>
      )}
    </div>
  )
}

/** Add / Edit song (LIB-1…3, LIB-6). Tokens from the native picker stand in for paths. */
export function SongDialog(props: Props): React.JSX.Element {
  const editing = props.mode === 'edit'
  const [state, dispatch] = useReducer(reducer, props, (p): FormState =>
    p.mode === 'edit' ? stateFromSong(p.song, p.song.coverPath) : emptyState(p.preset)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const set = useCallback((fn: (s: FormState) => FormState) => dispatch({ type: 'set', fn }), [])
  const api = window.api.library

  const pick = async (
    kind: 'gp' | 'midi' | 'mp3'
  ): Promise<{ token: string; name: string } | null> => (await api.pickFiles(kind))[0] ?? null

  const pickGp = async (): Promise<void> => {
    const f = await pick('gp')
    if (!f) return
    setWarning(null)
    set((s) => ({ ...s, gp: { kind: 'picked', ...f } }))
    const bytes = await api.readPicked(f.token)
    if (!bytes.ok) return setWarning(`Could not read that file: ${bytes.error}`)
    try {
      // alphaTab is large; load it only when a GP file is actually picked.
      const { readGpMetadata } = await import('../../player/gp-metadata')
      const meta = readGpMetadata(new Uint8Array(bytes.value))
      set((s) => applyGp(s, meta))
    } catch {
      setWarning(
        'That file could not be parsed as Guitar Pro. You can still save it, but check the file.'
      )
    }
  }

  const pickMaster = async (): Promise<void> => {
    const f = await pick('mp3')
    if (!f) return
    setWarning(null)
    set((s) => ({ ...s, master: { kind: 'picked', ...f }, masterSource: 'mp3' }))
    const id3 = await api.readId3(f.token)
    if (!id3.ok) return setWarning(`Could not read tags from that MP3: ${id3.error}`)
    set((s) => applyId3(s, id3.value))
  }

  const setSlot = (key: 'midi' | 'master', slot: Slot): void => set((s) => ({ ...s, [key]: slot }))
  const pickSimple = async (kind: 'midi'): Promise<void> => {
    const f = await pick(kind)
    if (f) setSlot(kind, { kind: 'picked', ...f })
  }
  const pickTrack = async (trackIndex: number): Promise<void> => {
    const f = await pick('mp3')
    if (!f) return
    set((s) => ({
      ...s,
      tracks: s.tracks.map((t) =>
        t.trackIndex === trackIndex ? { ...t, mp3: { kind: 'picked', ...f }, source: 'mp3' } : t
      )
    }))
  }
  const clearTrack = (trackIndex: number): void =>
    set((s) => ({
      ...s,
      tracks: s.tracks.map((t) =>
        t.trackIndex === trackIndex ? { ...t, mp3: NO_SLOT, source: 'synth' } : t
      )
    }))

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const form = toSongForm(state)
    const res =
      props.mode === 'edit' ? await api.updateSong(props.song.id, form) : await api.addSong(form)
    setBusy(false)
    if (res.ok) props.onSaved(res.value)
    else setError(res.error)
  }

  const ready = canSave(state)
  const coverShown = state.cover === 'none' ? null : state.coverPreview

  return (
    <Modal title={editing ? 'Edit song' : 'Add song'} onClose={props.onClose} wide>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready && !busy) void save()
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <section aria-label="Files" className="flex flex-col gap-2">
            <FileRow label="Guitar Pro" slot={state.gp} required onPick={() => void pickGp()} />
            <FileRow
              label="Master MP3"
              slot={state.master}
              onPick={() => void pickMaster()}
              onClear={() => setSlot('master', NO_SLOT)}
            />
            <FileRow
              label="MIDI"
              slot={state.midi}
              onPick={() => void pickSimple('midi')}
              onClear={() => setSlot('midi', NO_SLOT)}
            />
          </section>

          {warning && (
            <p role="alert" className="rounded border border-border bg-surface-2 px-3 py-2 text-sm">
              {warning}
            </p>
          )}

          <section aria-label="Details" className="flex gap-4">
            <div className="flex w-28 shrink-0 flex-col items-center gap-2">
              <Cover src={coverShown} size={112} />
              {state.cover !== 'none' && state.coverPreview && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => set((s) => ({ ...s, cover: 'none' }))}
                >
                  Remove cover
                </button>
              )}
              {state.cover === 'none' && state.coverPreview && (
                <button
                  type="button"
                  className={btn}
                  onClick={() =>
                    set((s) => ({ ...s, cover: state.hadCover && editing ? 'keep' : 'id3' }))
                  }
                >
                  Restore cover
                </button>
              )}
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2">
              {FIELD_LABELS.map((f) => (
                <label
                  key={f.key}
                  className={`flex flex-col gap-1 text-sm ${f.key === 'title' || f.key === 'artist' ? 'col-span-2' : ''}`}
                >
                  <span>
                    {f.label}
                    {(f.key === 'title' || f.key === 'artist') && (
                      <span className="text-danger"> *</span>
                    )}
                  </span>
                  <input
                    className={input}
                    value={state.fields[f.key]}
                    inputMode={f.inputMode}
                    onChange={(e) => set((s) => editField(s, f.key, e.target.value))}
                  />
                </label>
              ))}
            </div>
          </section>

          {state.tracks.length > 0 && (
            <section aria-label="Track MP3s" className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Per-track MP3s (optional)</h3>
              {state.tracks.map((t) => (
                <FileRow
                  key={t.trackIndex}
                  label={`${t.trackIndex + 1}. ${t.name}`}
                  slot={t.mp3}
                  onPick={() => void pickTrack(t.trackIndex)}
                  onClear={() => clearTrack(t.trackIndex)}
                />
              ))}
            </section>
          )}

          {editing && (
            <section aria-label="Sync" className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span>Master MP3 start offset (ms)</span>
                <input
                  className={input}
                  value={state.syncOffsetMs}
                  inputMode="numeric"
                  onChange={(e) => set((s) => ({ ...s, syncOffsetMs: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Master playback source</span>
                <select
                  className={input}
                  value={state.masterSource}
                  disabled={state.master.kind === 'none'}
                  onChange={(e) =>
                    set((s) => ({ ...s, masterSource: e.target.value === 'mp3' ? 'mp3' : 'synth' }))
                  }
                >
                  <option value="synth">Synth</option>
                  <option value="mp3">MP3</option>
                </select>
              </label>
            </section>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <p
            role="alert"
            className="min-w-0 flex-1 truncate text-sm text-danger"
            title={error ?? ''}
          >
            {error}
          </p>
          <button type="button" className={btn} onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={!ready || busy}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Add song'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

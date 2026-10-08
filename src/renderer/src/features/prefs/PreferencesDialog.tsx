import { useEffect, useState } from 'react'
import { THEMES, type PreferencesView, type ThemeName } from '@shared/types'
import { btn, input, Modal } from '../../components/Modal'
import { updatePrefs, usePrefsStore } from '../../prefs/store'
import { formatBytes } from './format'
import { LibraryMoveDialog } from './LibraryMoveDialog'

type TabId = 'appearance' | 'locations' | 'audio' | 'data'
const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'locations', label: 'Locations' },
  { id: 'audio', label: 'Audio' },
  { id: 'data', label: 'App data' }
]

const THEME_LABELS: Record<ThemeName, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  midnight: 'Midnight',
  amber: 'Amber'
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Swatch({ theme }: { theme: ThemeName }): React.JSX.Element {
  // Each preview carries its own data-theme, so it shows that theme's real tokens.
  const box = (t: string, extra = ''): React.JSX.Element => (
    <span
      data-theme={t}
      className={`flex h-8 flex-1 items-center justify-center bg-bg text-xs font-semibold text-accent ${extra}`}
    >
      Aa
    </span>
  )
  return (
    <span aria-hidden="true" className="flex w-full overflow-hidden rounded border border-border">
      {theme === 'system' ? (
        <>
          {box('light')}
          {box('dark')}
        </>
      ) : (
        box(theme)
      )}
    </span>
  )
}

function Appearance({ view }: { view: PreferencesView }): React.JSX.Element {
  return (
    <Section title="Theme">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((t) => (
          <label
            key={t}
            className={`flex cursor-pointer flex-col gap-2 rounded border p-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${view.theme === t ? 'border-accent' : 'border-border hover:border-fg-muted'}`}
          >
            <Swatch theme={t} />
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="theme"
                value={t}
                checked={view.theme === t}
                onChange={() => void updatePrefs({ theme: t })}
              />
              {THEME_LABELS[t]}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-fg-muted">
        System follows your operating system&apos;s light or dark setting. Changes apply
        immediately. The tab sheet itself always stays on white paper.
      </p>
    </Section>
  )
}

function PathRow({
  label,
  path,
  children
}: {
  label: string
  path: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium">{label}</span>
      <code
        className="select-text break-all rounded border border-border bg-bg px-2 py-1.5 text-xs"
        data-testid={`path-${label}`}
      >
        {path}
      </code>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Locations({
  view,
  onMoveLibrary
}: {
  view: PreferencesView
  onMoveLibrary: (useDefault: boolean) => void
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const { locations: l } = view
  const run = async (
    call: () => Promise<{ ok: true } | { ok: false; error: string }>
  ): Promise<void> => {
    setError(null)
    const r = await call()
    if (!r.ok) setError(r.error)
  }
  return (
    <div className="flex flex-col gap-5">
      <PathRow label="Library folder" path={l.libraryDir}>
        <button type="button" className={btn} onClick={() => onMoveLibrary(false)}>
          Change…
        </button>
        {l.libraryDir !== l.defaultLibraryDir && (
          <button type="button" className={btn} onClick={() => onMoveLibrary(true)}>
            Use default folder
          </button>
        )}
      </PathRow>
      <p className="-mt-3 text-xs text-fg-muted">
        Tab King keeps copies of your songs here. Moving the library offers to copy the files.
      </p>
      <PathRow label="Backup folder" path={l.backupDir}>
        <button
          type="button"
          className={btn}
          onClick={() => void run(() => window.api.prefs.chooseBackupDir())}
        >
          Change…
        </button>
        {l.backupDir !== l.defaultBackupDir && (
          <button
            type="button"
            className={btn}
            onClick={() => void run(() => window.api.prefs.resetBackupDir())}
          >
            Use default folder
          </button>
        )}
      </PathRow>
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    </div>
  )
}

interface DeviceOption {
  id: string
  label: string
}

function useOutputDevices(): DeviceOption[] {
  const [devices, setDevices] = useState<DeviceOption[]>([])
  useEffect(() => {
    let live = true
    const load = (): void => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((all) => {
          if (!live) return
          const out = all.filter(
            (d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== ''
          )
          // Labels stay empty until the app may use audio devices; number the entries so they can be told apart.
          setDevices(
            out.map((d, i) => ({ id: d.deviceId, label: d.label || `Output device ${i + 1}` }))
          )
        })
        .catch(() => live && setDevices([]))
    }
    load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => {
      live = false
      navigator.mediaDevices.removeEventListener('devicechange', load)
    }
  }, [])
  return devices
}

function Audio({ view }: { view: PreferencesView }): React.JSX.Element {
  const devices = useOutputDevices()
  const [error, setError] = useState<string | null>(null)
  const saved = view.audio.outputDeviceId
  const missing = saved !== null && !devices.some((d) => d.id === saved)
  const fontName = view.audio.soundFont

  return (
    <div className="flex flex-col gap-5">
      <Section title="Output device">
        <select
          aria-label="Output device"
          className={input}
          value={saved ?? ''}
          onChange={(e) => void updatePrefs({ audio: { outputDeviceId: e.target.value || null } })}
        >
          <option value="">System default</option>
          {missing && <option value={saved}>Saved device (not connected)</option>}
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-fg-muted">
          Used for the synthesizer, MP3 playback, the metronome and the count-in.
        </p>
      </Section>

      <Section title="When a song opens">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={view.audio.metronomeOn}
            onChange={(e) => void updatePrefs({ audio: { metronomeOn: e.target.checked } })}
          />
          Metronome on
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={view.audio.countInOn}
            onChange={(e) => void updatePrefs({ audio: { countInOn: e.target.checked } })}
          />
          Count-in on
        </label>
      </Section>

      <Section title="SoundFont">
        <p className="text-sm" data-testid="soundfont-name">
          {fontName ?? 'Built-in General MIDI bank (Sonivox EAS)'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => {
              setError(null)
              void window.api.prefs.chooseSoundFont().then((r) => !r.ok && setError(r.error))
            }}
          >
            Choose SoundFont…
          </button>
          {fontName && (
            <button
              type="button"
              className={btn}
              onClick={() => void window.api.prefs.resetSoundFont()}
            >
              Use built-in bank
            </button>
          )}
        </div>
        <p className="text-xs text-fg-muted">
          Pick a .sf2 or .sf3 file to change how the synthesizer sounds. Tab King keeps its own
          copy.
        </p>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      </Section>
    </div>
  )
}

function Data({ view }: { view: PreferencesView }): React.JSX.Element {
  const { locations: l } = view
  return (
    <div className="flex flex-col gap-4 text-sm">
      <PathRow label="Database" path={l.dbPath}>
        <span className="text-fg-muted">{formatBytes(l.dbSizeBytes)}</span>
      </PathRow>
      <p className="text-xs text-fg-muted">
        Your songs, play lists and favorites are stored in this database on your computer. Nothing
        is uploaded anywhere. Preferences are kept next to it in a settings file, so a restore never
        changes them. Use File → Backup / Restore to protect your library.
      </p>
    </div>
  )
}

export function PreferencesDialog({ onClose }: { onClose: () => void }): React.JSX.Element | null {
  const view = usePrefsStore((s) => s.view)
  const [tab, setTab] = useState<TabId>('appearance')
  const [moving, setMoving] = useState<{ useDefault: boolean } | null>(null)

  if (!view) return null
  // A second dialog replaces this one for a moment instead of stacking (each dialog traps Esc and focus).
  if (moving) {
    return <LibraryMoveDialog useDefault={moving.useDefault} onClose={() => setMoving(null)} />
  }

  const onTabKey = (e: React.KeyboardEvent, i: number): void => {
    const to =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? (i - 1 + TABS.length) % TABS.length
          : null
    if (to === null) return
    e.preventDefault()
    setTab(TABS[to]!.id)
    document.getElementById(`prefs-tab-${TABS[to]!.id}`)?.focus()
  }

  return (
    <Modal title="Preferences" onClose={onClose} wide>
      <div className="flex min-h-0 flex-1 text-sm">
        <div
          role="tablist"
          aria-label="Preferences sections"
          aria-orientation="vertical"
          className="flex w-36 shrink-0 flex-col gap-1 border-r border-border p-3"
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`prefs-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="prefs-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className={`rounded px-3 py-1.5 text-left hover:bg-surface-2 ${tab === t.id ? 'bg-surface-2 font-semibold' : ''}`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          id="prefs-panel"
          role="tabpanel"
          aria-labelledby={`prefs-tab-${tab}`}
          className="min-h-[22rem] min-w-0 flex-1 overflow-y-auto p-5"
        >
          {tab === 'appearance' && <Appearance view={view} />}
          {tab === 'locations' && (
            <Locations view={view} onMoveLibrary={(useDefault) => setMoving({ useDefault })} />
          )}
          {tab === 'audio' && <Audio view={view} />}
          {tab === 'data' && <Data view={view} />}
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <button type="button" className={btn} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

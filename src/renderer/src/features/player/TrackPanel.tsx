import { useState } from 'react'
import { player, usePlayerStore } from '../../player'
import { audibleTracks, MAX_TRACK_VOLUME } from '../../player/mix-math'
import { btn, input } from '../../components/Modal'

const smallToggle = (on: boolean, color: string): string =>
  `h-7 w-7 rounded border text-xs font-bold hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 ${
    on ? `${color} border-transparent` : 'border-border bg-surface-2'
  }`

/** Track list (TRK-1) with per-track solo/mute/volume (TRK-2) and the single-track practice view (TRK-5). */
export function TrackPanel(): React.JSX.Element {
  const tracks = usePlayerStore((s) => s.tracks)
  const practice = usePlayerStore((s) => s.practiceTrack)
  const ready = usePlayerStore((s) => s.status === 'ready')
  const hasMidi = usePlayerStore((s) => s.hasMidi)
  const synthSource = usePlayerStore((s) => s.synthSource)
  const midiError = usePlayerStore((s) => s.midiError)
  const masterSource = usePlayerStore((s) => s.masterSource)
  const hasMaster = usePlayerStore((s) => s.hasMaster)
  const playbackMode = usePlayerStore((s) => s.playbackMode)
  const audioStatus = usePlayerStore((s) => s.audioStatus)
  const audioError = usePlayerStore((s) => s.audioError)
  const silenced = usePlayerStore((s) => s.silencedSynthTracks)
  const [open, setOpen] = useState(true)
  const audible = new Set(audibleTracks(tracks, practice))

  return (
    <aside
      aria-label="Tracks"
      className={`flex shrink-0 flex-col border-r border-border bg-surface ${open ? 'w-72' : 'w-10'}`}
    >
      <div className="flex items-center justify-between border-b border-border px-2 py-2">
        {open && <h2 className="px-1 text-sm font-semibold">Tracks</h2>}
        <button
          type="button"
          className="h-7 w-7 rounded border border-border bg-surface-2 hover:border-accent"
          aria-label={open ? 'Collapse track panel' : 'Expand track panel'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '«' : '»'}
        </button>
      </div>

      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {practice !== null && (
            <button
              type="button"
              className={`${btn} mb-2 w-full !border-accent`}
              onClick={() => player.setPractice(null)}
            >
              Back to full mix
            </button>
          )}

          <p className="mb-2 text-xs text-fg-muted" aria-label="Playback engine">
            Audio: {playbackMode === 'mp3' ? 'MP3' : 'Synth'}
          </p>
          {audioStatus === 'loading' && (
            <p role="status" className="mb-2 text-xs text-fg-muted">
              Loading audio…
            </p>
          )}
          {audioError && (
            <p role="alert" className="mb-2 text-xs text-danger">
              {audioError}
            </p>
          )}
          {silenced.length > 0 && (
            <p role="status" className="mb-2 text-xs text-fg-muted">
              {silenced.length === 1 ? 'A synth track is' : `${silenced.length} synth tracks are`}{' '}
              silent while MP3 audio plays. Give {silenced.length === 1 ? 'it' : 'them'} an MP3, or
              choose Synth for the others.
            </p>
          )}

          {hasMaster && (
            <label className="mb-3 flex flex-col gap-1 text-xs">
              <span className="text-fg-muted">Band plays from</span>
              <select
                className={input}
                value={masterSource}
                disabled={!ready}
                onChange={(e) => player.setMasterSource(e.target.value === 'mp3' ? 'mp3' : 'synth')}
              >
                <option value="synth">Synth (use the tracks below)</option>
                <option value="mp3">Master MP3</option>
              </select>
              {masterSource === 'mp3' && practice === null && (
                <span className="text-fg-muted">
                  The master MP3 is one mix, so solo, mute and volume apply when practicing a track
                  or using stems.
                </span>
              )}
            </label>
          )}

          {hasMidi && (
            <label className="mb-3 flex flex-col gap-1 text-xs">
              <span className="text-fg-muted">Synth plays notes from</span>
              <select
                className={input}
                value={synthSource}
                disabled={!ready}
                onChange={(e) => player.setSynthSource(e.target.value === 'midi' ? 'midi' : 'gp')}
              >
                <option value="gp">The tab</option>
                <option value="midi">Attached MIDI file</option>
              </select>
              {synthSource === 'midi' && (
                <span className="text-fg-muted">
                  The cursor follows the tab&rsquo;s timing, so use a MIDI file exported from the
                  same tab.
                </span>
              )}
            </label>
          )}
          {midiError && (
            <p role="alert" className="mb-3 text-xs text-danger">
              {midiError}
            </p>
          )}

          {tracks.length === 0 && <p className="px-1 text-sm text-fg-muted">No tracks loaded.</p>}
          <ul className="flex flex-col gap-2">
            {tracks.map((t) => {
              const practiced = practice === t.index
              return (
                <li
                  key={t.index}
                  className={`rounded border p-2 ${practiced ? 'border-accent' : 'border-border'} ${
                    audible.has(t.index) ? '' : 'opacity-60'
                  }`}
                  aria-label={`Track ${t.index + 1}: ${t.name}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold" title={t.name}>
                      {t.index + 1}. {t.name}
                    </span>
                    <span className="shrink-0 text-xs text-fg-muted">{t.instrument}</span>
                  </div>
                  {t.hasMp3 && (
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-fg-muted">Source</span>
                      <select
                        className={`${input} !w-auto`}
                        aria-label={`Source for ${t.name}`}
                        value={t.source}
                        disabled={!ready}
                        onChange={(e) =>
                          player.setTrackSource(t.index, e.target.value === 'mp3' ? 'mp3' : 'synth')
                        }
                      >
                        <option value="synth">Synth</option>
                        <option value="mp3">Track MP3</option>
                      </select>
                    </label>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className={smallToggle(t.solo, 'bg-accent text-accent-fg')}
                      aria-label={`Solo ${t.name}`}
                      aria-pressed={t.solo}
                      disabled={!ready || practice !== null}
                      onClick={() => player.toggleSolo(t.index)}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      className={smallToggle(t.muted, 'bg-danger text-white')}
                      aria-label={`Mute ${t.name}`}
                      aria-pressed={t.muted}
                      disabled={!ready || practice !== null}
                      onClick={() => player.toggleMute(t.index)}
                    >
                      M
                    </button>
                    <input
                      type="range"
                      aria-label={`Volume ${t.name}`}
                      className="min-w-0 flex-1 accent-accent"
                      min={0}
                      max={MAX_TRACK_VOLUME}
                      step={0.05}
                      value={t.volume}
                      disabled={!ready}
                      onChange={(e) => player.setTrackVolume(t.index, Number(e.target.value))}
                    />
                    <span className="w-9 text-right text-xs tabular-nums text-fg-muted">
                      {Math.round(t.volume * 100)}%
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`${btn} mt-2 w-full !py-1 text-xs ${practiced ? '!border-accent !bg-accent !text-accent-fg' : ''}`}
                    aria-label={`Practice this track: ${t.name}`}
                    aria-pressed={practiced}
                    disabled={!ready}
                    onClick={() => player.setPractice(practiced ? null : t.index)}
                  >
                    Practice this track
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}

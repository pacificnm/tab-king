import { player, formatTime, usePlayerStore } from '../../player'
import { MAX_SPEED, MIN_SPEED } from '../../player/player-math'

const iconBtn =
  'flex h-9 w-9 items-center justify-center rounded border border-border bg-surface-2 text-lg hover:border-accent disabled:cursor-not-allowed disabled:opacity-40'
const toggleBtn = (on: boolean): string =>
  `rounded border px-3 py-1 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 ${
    on ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface-2'
  }`

interface Props {
  onShowPlayer: () => void
}

/** Static transport footer (PLY-2…6). Always visible; controls are disabled until a song is ready. */
export function Footer({ onShowPlayer }: Props): React.JSX.Element {
  const s = usePlayerStore()
  const ready = s.status === 'ready'
  const busy = s.playing || s.countingIn
  const pct = Math.round(s.speed * 100)

  return (
    <footer aria-label="Player" className="shrink-0 border-t border-border bg-surface px-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2" role="group" aria-label="Transport">
          <button
            type="button"
            className={iconBtn}
            aria-label="Previous measure"
            disabled={!ready}
            onClick={player.previous}
          >
            ⏮
          </button>
          <button
            type="button"
            className={iconBtn}
            aria-label={busy ? 'Pause' : 'Play'}
            disabled={!ready}
            onClick={player.togglePlay}
          >
            {busy ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className={iconBtn}
            aria-label="Next measure"
            disabled={!ready}
            onClick={player.next}
          >
            ⏭
          </button>
          <button
            type="button"
            className={iconBtn}
            aria-label="Stop"
            disabled={!ready}
            onClick={player.stop}
          >
            ■
          </button>
        </div>

        <input
          type="range"
          aria-label="Seek"
          className="min-w-0 flex-1 accent-accent"
          min={0}
          max={Math.max(1, Math.round(s.durationMs))}
          step={100}
          value={Math.min(Math.round(s.positionMs), Math.round(s.durationMs))}
          disabled={!ready}
          onChange={(e) => player.seekMs(Number(e.target.value))}
        />
        <span className="w-24 text-right text-sm tabular-nums" aria-label="Time">
          {formatTime(s.positionMs)} / {formatTime(s.durationMs)}
        </span>
        <span className="w-20 text-sm tabular-nums text-fg-muted" aria-label="Measure">
          {s.measureCount > 0 ? `M${s.currentMeasure}/${s.measureCount}` : 'M–'}
        </span>
        <button
          type="button"
          className="max-w-48 truncate text-left text-sm text-fg-muted hover:text-fg disabled:cursor-default"
          disabled={!s.song}
          onClick={onShowPlayer}
          title={s.song ? 'Show tab' : undefined}
        >
          {s.song ? `${s.song.title} — ${s.song.artistName}` : 'Nothing playing'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2" role="group" aria-label="Metronome">
          <button
            type="button"
            className={toggleBtn(s.metronomeOn)}
            aria-pressed={s.metronomeOn}
            disabled={!ready || s.playbackMode === 'mp3'}
            title={
              s.playbackMode === 'mp3'
                ? 'The metronome is available with synth playback'
                : undefined
            }
            onClick={player.toggleMetronome}
          >
            Metronome
          </button>
          <input
            type="range"
            aria-label="Metronome volume"
            className="w-20 accent-accent"
            min={0}
            max={1}
            step={0.05}
            value={s.metronomeVolume}
            disabled={!ready || s.playbackMode === 'mp3'}
            onChange={(e) => player.setMetronomeVolume(Number(e.target.value))}
          />
        </div>

        <button
          type="button"
          className={toggleBtn(s.countInOn)}
          aria-pressed={s.countInOn}
          disabled={!ready}
          onClick={player.toggleCountIn}
        >
          Count-in
        </button>

        <div className="flex items-center gap-2" role="group" aria-label="Loop">
          <button
            type="button"
            className={toggleBtn(s.loopOn)}
            aria-pressed={s.loopOn}
            disabled={!ready}
            onClick={player.toggleLoop}
          >
            Loop
          </button>
          <span className="text-sm text-fg-muted" aria-label="Selected bars">
            {s.range ? `Bars ${s.range.start}–${s.range.end}` : 'Whole song'}
          </span>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Speed">
          <button
            type="button"
            className={iconBtn}
            aria-label="Slower"
            disabled={!ready || s.speed <= MIN_SPEED}
            onClick={() => player.stepSpeed(-1)}
          >
            −
          </button>
          <span className="w-12 text-center text-sm tabular-nums" aria-label="Speed value">
            {pct}%
          </span>
          <button
            type="button"
            className={iconBtn}
            aria-label="Faster"
            disabled={!ready || s.speed >= MAX_SPEED}
            onClick={() => player.stepSpeed(1)}
          >
            +
          </button>
          <button
            type="button"
            className={toggleBtn(false)}
            disabled={!ready || pct === 100}
            onClick={player.resetSpeed}
          >
            Reset
          </button>
        </div>

        <label className="ml-auto flex items-center gap-2 text-sm">
          Volume
          <input
            type="range"
            aria-label="Master volume"
            className="w-24 accent-accent"
            min={0}
            max={1}
            step={0.05}
            value={s.masterVolume}
            disabled={!ready}
            onChange={(e) => player.setMasterVolume(Number(e.target.value))}
          />
        </label>
      </div>
    </footer>
  )
}

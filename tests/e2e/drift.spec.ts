import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { rmSync } from 'node:fs'
import { addAudioSong, launchApp, makeTmp } from './helpers'

/**
 * SYN-4: playing, seeking, looping and speed changes keep the tab cursor and the MP3 within ~30 ms.
 *
 * The fixture MP3 has a 50 ms beep every 500 ms. A probe on the audio output records each beep as it is heard together
 * with where the cursor is at that instant; the sync map says where on the tab that beep belongs. The difference,
 * expressed in real time (tab ms / speed), is the drift. It covers the stretch node's alignment, the media→tab mapping
 * (offset, sync points), alphaTab following our clock, and the effect of seeks and loop wraps.
 *
 * Manual cross-check (documented in docs/SPECS.md §6.3): play any song with a metronome-like recording and watch that
 * the cursor lands on each click.
 */
const BUDGET_MS = 30
/**
 * "Within ~30 ms" is asserted for the typical beep (90th percentile). The cursor is drawn on animation frames, so a rare
 * main-thread stall (GC, a busy CI machine) can delay it for one beep; a hard ceiling still catches real regressions,
 * and a systematic error would push every beep, and so the percentile, over the budget.
 */
const CEILING_MS = 60

type Scenario =
  | { name: 'play'; speed: number }
  | { name: 'sync'; speed: number; offsetMs: number; points: { measure: number; mp3Ms: number }[] }
  | { name: 'speed-change'; from: number; to: number }
  | { name: 'seek'; speed: number }
  | { name: 'loop'; speed: number }

let tmp: string
let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  tmp = makeTmp()
  ;({ app, page } = await launchApp(tmp))
  await addAudioSong(app, page, tmp)
  await page.getByRole('article').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByLabel('Tracks', { exact: true }).getByLabel('Playback engine')).toHaveText(
    'Audio: MP3',
    { timeout: 30_000 }
  )
  const footer = page.getByLabel('Player', { exact: true })
  await footer.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 30_000 })
  await page.evaluate(() => window.__tabking!.player.pause())
  await expect(footer.getByRole('button', { name: 'Play' })).toBeVisible()
})

test.afterEach(async () => {
  await app.close().catch(() => undefined)
  rmSync(tmp, { recursive: true, force: true })
})

interface Report {
  /** Real-time drift (ms) of each settled beep. */
  drift: number[]
  freqs: number[]
  beeps: number
  wraps: number
}

interface Raw {
  beeps: { mediaMs: number; freqHz: number; ctxTime: number }[]
  /** Cursor trace on the audio clock. */
  trace: { ctx: number; tab: number }[]
  /** Audio-clock times of deliberate jumps (start, seek, speed change, loop wrap). */
  marks: number[]
  mapped: (number | null)[]
  speed: number
  /** Speed before `changeAt` (audio-clock time), for scenarios that change speed while playing. */
  speedBefore: number
  changeAt: number
  latency: number
  wraps: number
}

/** Cursor tab time at audio-clock time `t`, interpolated from the trace (null if t is outside it). */
function cursorAt(trace: Raw['trace'], t: number): number | null {
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1]!
    const b = trace[i]!
    if (t >= a.ctx && t <= b.ctx)
      return b.ctx === a.ctx ? b.tab : a.tab + ((b.tab - a.tab) * (t - a.ctx)) / (b.ctx - a.ctx)
  }
  return null
}

/**
 * Run a scenario in the page while recording beeps and a cursor trace. For each beep, drift is the cursor's tab time at
 * the moment the beep reaches the listener (graph time + output latency) minus where the sync map says the beep
 * belongs, in real time. Beeps within a short window around deliberate jumps are skipped: audio and cursor are
 * legitimately re-aligning there (the jump itself is covered by the next beeps).
 */
async function measure(scenario: Scenario, durationMs: number): Promise<Report> {
  const raw: Raw = await page.evaluate(
    async ({ scenario, durationMs }) => {
      const t = window.__tabking!
      const p = t.player
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      const trace: { ctx: number; tab: number }[] = []
      const marks: number[] = []
      let latency = 0
      const sampler = setInterval(() => {
        const c = t.cursorSample()
        if (c) {
          latency = c.outputLatency
          trace.push({ ctx: c.ctxTime, tab: c.tabMs })
        }
      }, 4)
      const mark = (): number => marks.push(t.cursorSample()?.ctxTime ?? 0)
      const stop = t.probeOnsets()!
      let speed = 1
      let speedBefore = 1
      let changeAt = Infinity
      let wraps = 0

      switch (scenario.name) {
        case 'play':
          speed = scenario.speed
          p.setSpeed(speed)
          p.restart()
          mark()
          p.togglePlay()
          await sleep(durationMs)
          break
        case 'sync':
          speed = scenario.speed
          p.setSync(scenario.offsetMs, scenario.points)
          p.setSpeed(speed)
          p.restart()
          mark()
          p.togglePlay()
          await sleep(durationMs)
          break
        case 'speed-change':
          speed = scenario.to
          speedBefore = scenario.from
          p.setSpeed(scenario.from)
          p.restart()
          mark()
          p.togglePlay()
          await sleep(durationMs / 2)
          p.setSpeed(scenario.to)
          changeAt = mark() && (t.cursorSample()?.ctxTime ?? Infinity)
          await sleep(durationMs / 2)
          break
        case 'seek':
          speed = scenario.speed
          p.setSpeed(speed)
          p.restart()
          mark()
          p.togglePlay()
          await sleep(durationMs / 3)
          p.seekMs(8300) // roughly bar 5
          mark()
          await sleep(durationMs / 3)
          p.seekMs(1100) // back near the start
          mark()
          await sleep(durationMs / 3)
          break
        case 'loop': {
          speed = scenario.speed
          p.setSpeed(speed)
          p.setRange(2, 3) // 4 s of tab
          p.toggleLoop()
          p.restart()
          mark()
          p.togglePlay()
          let last = t.state().currentMeasure
          const start = performance.now()
          while (performance.now() - start < durationMs) {
            await sleep(10)
            const m = t.state().currentMeasure
            if (m < last) {
              mark()
              wraps++
            }
            last = m
          }
          p.toggleLoop()
          p.clearRange()
          break
        }
      }
      p.pause()
      clearInterval(sampler)
      const beeps = stop()
      return {
        beeps,
        trace,
        marks,
        speed,
        speedBefore,
        changeAt,
        latency,
        wraps,
        mapped: beeps.map((b) => t.tabMsForFileMs(Math.round((b.mediaMs - t.padMs) / 500) * 500))
      }
    },
    { scenario, durationMs }
  )

  const drift: number[] = []
  raw.beeps.forEach((b, i) => {
    const expected = raw.mapped[i]
    if (expected === null || expected === undefined) return
    // skip beeps near a deliberate jump (wall-clock window scales with speed: audio-clock seconds are real seconds)
    if (raw.marks.some((m) => b.ctxTime >= m - 0.3 && b.ctxTime <= m + 0.9)) return
    const heard = cursorAt(raw.trace, b.ctxTime + raw.latency)
    if (heard === null) return
    drift.push((heard - expected) / (b.ctxTime < raw.changeAt ? raw.speedBefore : raw.speed))
  })
  return { drift, freqs: raw.beeps.map((b) => b.freqHz), beeps: drift.length, wraps: raw.wraps }
}

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!
}

function check(report: Report, label: string, minBeeps: number): void {
  expect(report.beeps, `${label}: beeps heard`).toBeGreaterThanOrEqual(minBeeps)
  const abs = report.drift.map(Math.abs)
  const max = Math.max(...abs)
  const p90 = percentile(abs, 0.9)
  const mean = report.drift.reduce((a, b) => a + b, 0) / report.drift.length
  console.log(
    `${label}: ${report.beeps} beeps, p90 ${p90.toFixed(1)} ms, max ${max.toFixed(1)} ms, mean ${mean.toFixed(1)} ms`
  )
  if (p90 > BUDGET_MS || max > CEILING_MS) {
    console.log(`${label}: drift per beep = ${report.drift.map((d) => d.toFixed(0)).join(' ')}`)
  }
  expect(p90, `${label}: 90th percentile drift`).toBeLessThanOrEqual(BUDGET_MS)
  expect(max, `${label}: worst drift`).toBeLessThanOrEqual(CEILING_MS)
}

test('stays in sync at normal speed', async () => {
  check(await measure({ name: 'play', speed: 1 }, 8000), '100%', 10)
})

test('stays in sync at 60% and 150%, with pitch preserved', async () => {
  for (const speed of [0.6, 1.5]) {
    const r = await measure({ name: 'play', speed }, 8000)
    check(r, `${speed * 100}%`, 6)
    // the 1000 Hz beeps keep their pitch (plain varispeed would give 600 / 1500 Hz)
    const sorted = r.freqs.filter((f) => f > 0).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]!
    expect(median, `${speed * 100}% pitch`).toBeGreaterThan(900)
    expect(median, `${speed * 100}% pitch`).toBeLessThan(1100)
  }
})

test('stays in sync with a start offset and sync points that warp the tempo', async () => {
  // offset 250 ms, and the recording runs 1 s slow by bar 5 and catches back up by bar 8
  const r = await measure(
    {
      name: 'sync',
      speed: 1,
      offsetMs: 250,
      points: [
        { measure: 5, mp3Ms: 9250 },
        { measure: 8, mp3Ms: 14250 }
      ]
    },
    9000
  )
  check(r, 'offset + sync points', 8)
})

test('stays in sync across a speed change while playing', async () => {
  check(await measure({ name: 'speed-change', from: 1, to: 0.7 }, 9000), 'speed change', 8)
})

test('stays in sync after seeking while playing', async () => {
  check(await measure({ name: 'seek', speed: 1 }, 9000), 'seek', 8)
})

test('stays in sync across loop wraps', async () => {
  const r = await measure({ name: 'loop', speed: 1 }, 11_000)
  expect(r.wraps, 'loop wraps').toBeGreaterThanOrEqual(2)
  check(r, 'loop', 10)
})

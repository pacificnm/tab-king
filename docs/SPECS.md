# Tab King — Technical Specification

Implements [REQUIREMENTS.md](REQUIREMENTS.md). IDs in brackets trace back to requirements.

## 1. Architecture

```
┌──────────────── Electron main (Node) ────────────────┐
│ window mgmt · IPC handlers · SQLite (better-sqlite3)  │
│ library file store · ID3 (music-metadata) · backup    │
│ update check (GitHub API) · protocol handler          │
└───────────────▲──────────────────────────────────────┘
                │ typed IPC (contextBridge → window.api)
┌───────────────┴──────────────────────────────────────┐
│ Preload: exposes minimal, validated API               │
└───────────────▲──────────────────────────────────────┘
┌───────────────┴──────────────────────────────────────┐
│ Renderer (React + Tailwind)                           │
│ shell · sidebar · tab view · footer · dialogs         │
│ player/ (alphaTab wrapper, MP3 engine, sync map)      │
└──────────────────────────────────────────────────────┘
```

- Tooling: electron-vite, TypeScript strict, Vitest, Playwright, ESLint, Prettier, electron-builder.
- Security [NFR-4]: `contextIsolation`, `sandbox`, no `nodeIntegration`, strict CSP, `will-navigate`/`window.open` denied, IPC channels allow-listed and payloads validated (zod).
- Media access: custom protocol `tabking://library/<relpath>` served from the library folder (path-traversal checked, range requests supported) so the renderer never sees raw file paths.

### Directory layout

```
src/main/        index.ts, window.ts, ipc/, db/ (migrations/, repo/), library/, backup/, update/
src/preload/     index.ts
src/renderer/    app/, components/, features/{nav,player,song,prefs,help}/, player/, styles/
src/shared/      types.ts, ipc-contract.ts
resources/       soundfont, icons, help/*.md
docs/ tests/
```

## 2. Window and shell [WIN-*]

- `BrowserWindow({ frame: false, titleBarStyle: 'hidden' })`; on macOS keep `trafficLightPosition` hidden and draw our own buttons for consistency.
- Title bar: `-webkit-app-region: drag`; interactive children `no-drag`. Buttons call `window.api.win.{minimize,toggleMaximize,close}`.
- Resizing: frameless windows resize natively on Windows/macOS; on Linux add invisible 4 px resize handles if the WM doesn't provide them (verify per WM).
- Title bar order: hamburger · app title · menu bar (File, Help) · drag space · window buttons. The menu bar (`MenuBar`) is an ARIA `menubar` with drop-down `menu`s: File → Preferences, Backup / Restore; Help → Help Contents, About. Arrow keys move between items/menus, Enter activates, Esc closes; hovering another top-level item while one is open switches menus.
- Left flyout (`Flyout` + `NavMenu`): React slide-in panel (≈280 px) over content with backdrop; contains library navigation only (Search, Play Lists, Favorites, Artists); focus-trapped, Esc closes.
- Right help flyout: slide-in panel with TOC list (from `resources/help/toc.json`) and rendered Markdown (react-markdown).
- Window bounds saved to `settings` (debounced).

## 3. Data model (SQLite) [LIB-*]

WAL mode, foreign keys on. Migrations numbered `NNN_name.sql`, tracked in `schema_migrations`; DB file backed up before any migration [NFR-6].

```sql
artist(id PK, name UNIQUE COLLATE NOCASE)
album(id PK, artist_id FK, title, year, cover_path, UNIQUE(artist_id,title))
song(id PK, album_id FK NULL, artist_id FK, title, track_no, genre, year,
     gp_path NOT NULL, midi_path, master_mp3_path,
     synth_source TEXT CHECK(synth_source IN ('gp','midi')) DEFAULT 'gp',  -- 002
     sync_offset_ms INT DEFAULT 0, duration_ms, created_at, updated_at)
song_track(id PK, song_id FK, track_index INT, name, instrument,
           mp3_path, source TEXT CHECK(source IN ('synth','mp3')) DEFAULT 'synth',
           volume REAL DEFAULT 1, muted INT DEFAULT 0, solo INT DEFAULT 0,   -- 002
           UNIQUE(song_id,track_index))
sync_point(id PK, song_id FK, measure INT, mp3_ms INT, UNIQUE(song_id,measure))
playlist(id PK, name UNIQUE)
playlist_song(playlist_id FK, song_id FK, position INT, PK(playlist_id,song_id))
favorite(song_id PK FK, created_at)
settings(key PK, value JSON)
song_fts  -- FTS5 virtual table over title, artist, album, genre; kept in sync by triggers
```

- Paths are stored relative to the library folder. Cascade deletes on song children. Empty albums/artists are pruned on song delete/move.
- Master source preference stored in `settings` per song (`song.master_source`, added in migration 001: `'synth'|'mp3'`).

## 4. Library and ID3 [LIB-*]

Add flow (dialog, also used by Edit):

1. Pick GP file (required) → parse with alphaTab (in renderer) for title, artist, album, tracks → prefill.
2. Pick optional MIDI, master MP3, and per-track MP3s (one row per GP track).
3. Main reads master MP3 ID3 via music-metadata (title, artist, album, year, track, genre, picture); ID3 overrides GP metadata for prefill; user can edit.
4. On Save, in one operation: copy files to `<library>/<Artist>/<Album>/<Title>/…` (sanitised, collision-suffixed), write the cover to `<library>/<Artist>/<Album>/cover.<ext>` (extension from the embedded picture's MIME type), insert rows in a transaction; on any failure remove copied files and roll back.

Implementation notes (M1):

- **File tokens.** The native picker runs in main; the renderer receives opaque `{token, name}` pairs, never paths, and passes tokens back on save. Main resolves tokens only from its own registry (`PickedFiles`), so the renderer cannot make main read or copy arbitrary paths. Existing files are referenced as `{existing: relPath}` and must belong to the song being edited.
- **Edit keeps files in place.** Changing artist/album/title does not move files (DB paths stay valid); newly added files go into the song's existing folder. Replaced/removed files are deleted after the DB update succeeds; empty folders are pruned.
- **Covers belong to albums.** A song without an album has no cover. Cover choices on save: `keep`, `id3` (extract from the newly picked master MP3), `none`. A cover file is removed when its album is pruned.
- **Song tracks.** One `song_track` row is stored per GP track (name, instrument family, optional MP3), so later phases need no re-parse.
- **Errors.** Add/update/delete/read operations return `Result<T>` (`{ok:true,value}` / `{ok:false,error}`) so failures surface as readable messages; nothing throws across IPC for expected failures.
- **Missing files [LIB-8].** `checkSong` reports which of a song's files are absent. The song view lists them with a banner; Play refuses with a message naming what is missing; cover `<img>` errors fall back to the placeholder; the `tabking://` handler returns 404.
- **Media protocol.** `tabking://library/<relpath>`: each path segment is URL-decoded and rejected if empty, `.`/`..` or contains `/`, `\` or NUL; the store then re-checks containment. Single `Range` requests return `206`; unsatisfiable ranges return `416`.
- **Native module.** `better-sqlite3` 13 ships N-API prebuilds (one binary for Node and Electron), so there is no Electron rebuild step and Vitest tests run against the real driver.

Context menus [NAV-3]: Artist → Add song, Edit artist (rename), Play all. Album → Add song, Edit, Play. Song → Edit, Play, Add to playlist, Favorite, Delete. Playlist → Add, Rename, Play, Delete. "Add" opens the Add dialog preset with that artist/album.

## 5. Navigation UI [NAV-*]

- Flyout top-level, in order: Search, Play Lists, Favorites, Artists. Lazy-loaded tree for Artist → Album → Song with virtualization (react-window) [NFR-3].
- Search: input with 150 ms debounce → `song_fts MATCH` with prefix queries; results grouped Songs / Albums / Artists.
- Playlists: drag-and-drop reorder; Play starts a queue.
- Double-click a song or Play opens it in the player and sets queue context (album/playlist/search).

## 6. Player [PLY-_, TRK-_]

### 6.1 Layout

Main region = alphaTab surface + track panel (collapsible, left or top). Static footer, always visible:

```
[⏮ prev] [▶/⏸] [⏭ next] [■]  ──── seek ──── 00:42 / 03:55  M12
[Metronome ◉] [Count-in ◉] [Loop ◉ + Select] [Speed 100% ▾] [Master vol]
```

### 6.2 alphaTab integration (`src/renderer/src/player/`)

- `PlayerEngine` (`player-engine.ts`) is the only code that touches `AlphaTabApi`. Components call the `player` controller in `index.ts` and read the Zustand `usePlayerStore`; alphaTab events are translated into store updates. The engine is created by the lazy-loaded `TabView` (alphaTab is ~2.3 MB, loaded on first Play) and attached to the controller; commands are no-ops until then.
- Settings: `enablePlayer`, `enableCursor`, `enableUserInteraction`, `enableElementHighlighting`, `scrollMode: continuous` with the tab view's scroll container as `scrollElement`. The SoundFont is `player.soundFont = tabking://app/soundfont/sonivox.sf3` and alphaTab sequences the download against its own player/MIDI setup (fetching the bytes ourselves and calling `loadSoundFont` raced with that setup: the SoundFont was silently dropped whenever it arrived before the first score finished loading). Bravura loads from `tabking://app/font/` (`core.fontDirectory`). Nothing comes from a CDN.
- **Media protocol hosts.** `tabking://library/<rel>` serves user files; `tabking://app/<rel>` serves bundled assets from `resources/`, restricted to the `soundfont/` and `font/` prefixes. Both send `Access-Control-Allow-Origin: *` and the scheme is registered `corsEnabled`, because the page origin is `file://` (production) or the Vite dev server.
- **Bundling.** `@coderline/alphatab-vite` handles workers/worklets (its asset copying is off; we serve assets ourselves). The renderer config defines `__BASE__` so alphaTab recognises the Vite build — without it the render worker and audio worklet cannot be located. alphaTab is pinned to an exact version.
- Position/measure: `playerPositionChanged` drives time and (when idle or seeking) the measure via the tick→measure table built from `tickCache`; `playedBeatChanged` gives the measure while playing, so repeats display correctly.
- Metronome: `api.metronomeVolume` (0 when off). **Count-in** is our own (`count-in.ts`): exactly 3 Web Audio clicks (first accented) at the tempo of the current measure × speed, then `api.play()` is called on the beat where the music starts. alphaTab's built-in count-in is a full bar (4 clicks in 4/4), which does not match PLY-4, so `countInVolume` stays 0. The count-in is cancelled by Pause/Stop and is independent of the audio source (it will also precede MP3 playback).
- Loop/select: alphaTab's click-drag selection sets `playbackRange` (reported via `playbackRangeChanged`). For keyboard/precise use the toolbar has **Bars [from]–[to] + Select**, and a **Section** picker built from GP section markers; both call `api.playbackRange`. `api.isLooping` is the footer **Loop** toggle; **Clear selection** resets the range. Looping and the range survive seeks.
- Speed: `api.playbackSpeed`, 25–200% in 5% steps (`clampSpeed`/`stepSpeed`), Reset = 100%. The setting persists across songs within a session.
- Zoom 50–200% (`display.scale`) and Page/Horizontal layout (`display.layoutMode`) re-render via `updateSettings()` + `render()`.
- Shortcuts (`shortcuts.ts`, `usePlayerShortcuts`): Space play/pause, Home restart, `[` / `]` speed −/+5%, L loop, M metronome, C count-in. Ignored while typing, with modifiers, inside menus/trees/dialogs, and Space is left to a focused button.
- Previous/Next seek to the previous/next **measure** start (`prevBarTick`/`nextBarTick`); Previous restarts the current measure unless within half a beat of its start. Click a note/beat to seek (alphaTab built-in).
- When the player is showing, the library views underneath are `inert` so keyboard focus cannot linger on hidden controls.
- Tracks: `api.renderTracks([...])` and `changeTrackSolo/Mute/Volume` arrive with M3.

### 6.3 Audio sources and MP3 engine [TRK-3/4/5, SYN-*, PLY-6]

Per track and for the master, `source ∈ {synth, mp3}` (stored in `song_track.source` and `song.master_source`; a source of `mp3` needs an attached file).

**Two playback modes share one alphaTab instance** and are switched at runtime (`api.settings.player.playerMode` + `updateSettings()`, which re-creates the player; position, range, loop, speed and playing state are carried across):

- `synth` — alphaTab's synthesizer is the clock (everything in §6.2).
- `mp3` — alphaTab runs in **external-media mode**. Our `Mp3Engine` is the clock: alphaTab keeps owning looping, the playback range, speed, seeking and the cursor, and calls our handler (`play`, `pause`, `seekTo`, `playbackRate`, `masterVolume`); we report the audio's position back with `output.updatePosition(ms)` every animation frame, and alphaTab turns it into a tab position through the **sync points** (below).

**Which mode and which audio — `planPlayback` (`mix-plan.ts`, unit-tested) [TRK-4, TRK-5]:**

1. _Practicing a track_ plays that track's stem if its source is `mp3`, otherwise the synth; the master is silent.
2. Otherwise, if the band source is the **master MP3**, the master plays alone (it is one pre-mixed recording, so per-track mute/solo/volume cannot apply to it).
3. Otherwise each audible track (mute/solo as in M3) plays from its own source. If any plays from a stem the MP3 engine runs at the track's volume; if none does, the synth runs.

**Known limitation — synth and MP3 cannot sound together.** alphaTab's external-media mode has no synthesizer, so a synth-sourced track that should be heard while MP3 audio plays stays silent; the track panel says so explicitly (`silencedSynthTracks`). A source that fails to load (missing/undecodable file) is reported and the plan is recomputed without it, falling back to the synth. The metronome is synth-only and is disabled in `mp3` mode.

**`Mp3Engine` (`mp3-engine.ts`).** One `AudioContext` for everything, so all sources share one clock. Each source is fetched over `tabking://`, decoded (`decodeAudioData`), padded with `PAD_MS` (8 s) of leading silence — so a **negative start offset** needs no special case — and handed to its own stretch node and gain node. Playback is _scheduled_, not streamed: `schedule({output, input, rate, active})` with `output` = context time. The position model is `position(t) = input + (t − output) · rate`, so the engine knows exactly where every source is without polling the worklet, and a late-joining source is lined up by scheduling it at the current model position. Mute/solo/stem switching only ramps gains (20 ms), so switching between master and stems never restarts audio. Decoded audio is large (~85 MB for 4 min of stereo), so a memory budget (640 MB) evicts least-recently-used sources that the current plan does not need; remaining stems are preloaded in the background while under 400 MB.

**Spike #40 — pitch-preserving time-stretch: decision.**

| Candidate                                          | Licence  | Verdict                                                                                                                                                                                                                          |
| -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `soundtouchjs` (`AudioBufferSourceNode` + stretch) | LGPL-2.1 | Rejected: LGPL is a poor fit for an Apache-2.0 app that bundles its dependencies, and it only offers rate changes on a node, not scheduled positions.                                                                            |
| `@soundtouchjs/audio-worklet`                      | MPL-2.0  | Viable, but a single processor per stream without position scheduling; we would have to build alignment ourselves.                                                                                                               |
| `HTMLAudioElement.preservesPitch`                  | —        | Rejected: no sample-accurate clock, seeks are slow, and several elements cannot be kept aligned.                                                                                                                                 |
| **`signalsmith-stretch`** (JS/WASM AudioWorklet)   | MIT      | **Chosen.** Works on loaded buffers, is scheduled by AudioContext time with a per-change `rate`, compensates its own latency, and its position arithmetic is exactly the model above. Several nodes scheduled at one time align. |

Measured (this repo's e2e harness, Linux x64 desktop, Electron 44): 1000 Hz test beeps played at 60% and 150% measured ≈ 970–1010 Hz (a plain varispeed would give 600/1500 Hz) — pitch is preserved. App CPU during steady playback at 60% speed was **≈ 0.7% of one core with one source and ≈ 1.0% with three loaded sources** (all loaded sources are processed even at zero gain, which keeps stem switching instantaneous). **Not yet verified on a Raspberry Pi 5** (no hardware available); expect a few times higher CPU there. If it proves CPU-bound on ARM, the mitigation is to deactivate silent sources (`active: false`) at the cost of a short warm-up when a stem is switched in, and `configure({ preset: 'cheaper' })`. The worklet module is served as a normal bundled file via `SignalsmithStretch.moduleUrl` (its default is a Blob URL, which our CSP forbids), and the CSP gains `'wasm-unsafe-eval'` (WebAssembly compilation only — no JS `eval`, no `blob:` scripts).

**Spike #41 — alphaTab external media (1.8.4, pinned): findings.**

- Enable with `PlayerMode.EnabledExternalMedia`. `api.player.output` then has `handler` and `updatePosition(ms)` (the types are not exported, so `mp3-playback.ts` declares them locally).
- Switching modes at runtime works through `updateSettings()`; the handler must be re-attached afterwards because the player is re-created.
- With no sync points the media→tab mapping is the identity. `score.applyFlatSyncPoints([...])` + `api.updateSyncPoints()` installs anchors; mapping is piecewise-linear in tab time and `api.timePosition` → `handler.seekTo` uses the inverse. `barPosition: 1` (end of a bar) is accepted.
- alphaTab maps time _after the last anchor_ by stretching the remaining tab over the remaining audio, and before the first by extrapolating the first segment. Our spec wants "continue the last segment's ratio", so `buildSyncMap` always appends a trailing anchor at the end of the tab with that ratio.
- The cursor is painted on the frame after `updatePosition`, so the ticker reports where the audio _will be_ one half-frame later (8 ms); without that the cursor trails by a speed-dependent amount.
- Position events arrive every frame in this mode; the store throttles them to ~12 Hz (measure changes and seeks still update immediately).

### 6.4 Sync model [SYN-1/2/3/5]

- `song.sync_offset_ms`: MP3 time at bar 1. May be negative (audio starting after bar 1), down to −8 s.
- `sync_point(measure, mp3_ms)` (measure ≥ 2, unique per song, strictly increasing in both measure and time): the MP3 time at the start of that measure. **One map per song, shared by the master and every stem [SYN-5].**
- `buildSyncMap` (`sync-map.ts`, pure, unit-tested): anchors = (bar 1, offset) + user points + trailing anchor. Between anchors time is interpolated linearly **in tab time**, so tempo changes inside the tab are respected; beyond the ends the nearest segment's ratio continues. `tabMsToMp3Ms`/`mp3MsToTabMs` are inverses and monotonic; `measureToMp3Ms`/`mp3MsToMeasure` serve the editor; `validateSyncPoints` reports out-of-range, duplicate, non-monotonic and past-the-end points. Bar start times in ms come from the MIDI tempo events (`tempo-map.ts`).
- **Sync editor** (`SyncEditor.tsx`, opened from "Sync audio…" in the player toolbar — it needs the tab and the live engine): canvas waveform (100 peaks/s) with the playhead and a line for every bar at the position the _current_ map gives it (orange = anchored, grey = inferred), click-to-seek, whole-song or 20 s zoom; start-offset field with ±10/±100 ms nudges and "Set to playhead"; "Set bar here" binds the playhead to a chosen bar (bar 1 = offset); per-point time field, ±10 ms, "Set to playhead", delete; validation list that blocks Save; Play/Pause and "Play from bar N" for A/B preview. Every edit is applied to the running engine immediately; Cancel restores the saved values; Save writes offset and points in one transaction (`library.saveSync`).
- If the master is not the playing source the editor offers "Use the master MP3" (it needs MP3 audio running to show a waveform and play).

## 7. Preferences [PRF-*]

Dialog sections: Appearance (theme), Locations (library, backup folder), Audio (output device via `setSinkId`, defaults, SoundFont), About app data (DB path, size).

- Themes: CSS variables on `<html data-theme>`; Tailwind config maps colors to variables. Built-ins: light, dark, system, "midnight" (blue), "amber".
- Changing library folder: confirm, copy files, update `settings.library_dir`, verify, then offer to remove old files.
- Default locations: `app.getPath('userData')` for DB; `~/Music/TabKing` for library; `~/Documents/TabKing Backups`.

## 8. Backup / restore, help, about [BKP-_, HLP-_, ABT-*]

- Backup: SQLite `VACUUM INTO` temp file → zip (archiver) with `manifest.json {appVersion, schemaVersion, createdAt}`, `tabking.db`, `library/**`. Progress events to UI.
- Restore: validate zip + manifest (schema ≤ app's), close DB, extract to temp dir, swap with the current data (kept as `.bak` until success), reopen and run migrations; on error roll back.
- Help Contents: `resources/help/*.md` + `toc.json`; right flyout with TOC and article view.
- About modal: name, version (`app.getVersion()`), license, repo link. **Check for updates** → main calls `GET https://api.github.com/repos/pacificnm/tab-king/releases/latest`, compares semver with `app.getVersion()`, returns `{upToDate, latest, url}`; errors shown inline. Only on click.

## 9. Licensing and third-party

- Project: Apache-2.0 (`LICENSE`, `NOTICE` file listing third-party attributions).
- alphaTab MPL-2.0: unmodified use via npm is compatible; any modifications to alphaTab files must be published under MPL-2.0.
- SoundFont: the Sonivox EAS GM bank (`resources/soundfont/sonivox.sf3`, from the alphaTab distribution, Apache-2.0 © Sonic Network Inc.). Its license text ships next to it and is recorded in `NOTICE`. The Bravura music font (SIL OFL 1.1) lives in `resources/font/`.
- CI runs a license checker on production dependencies.

## 10. Testing

- Unit (Vitest): sync-map, audibleSet mixing, repo/queries on in-memory SQLite, filename sanitiser, semver compare.
- Integration: migrations from empty and from each prior version; backup→restore round trip.
- E2E (Playwright-Electron): add song, browse tree, play/loop, preferences theme, backup/restore, about/update (mocked GitHub).
- Manual checklist per platform for frameless window behavior and audio devices.
- Fixtures: GP and MIDI files and tag-only MP3s are generated programmatically (`tests/e2e/fixtures.ts`, via alphaTab's exporter/MIDI generator and a hand-built ID3v2 tag). Real audio fixtures — 24 s of 50 ms beeps every 500 ms (120 bpm) at three pitches — are checked in under `tests/fixtures/` (see its README for the ffmpeg command).
- **Drift test** (`tests/e2e/drift.spec.ts`, SYN-4): a probe on the audio output records each beep as it reaches the listener; a trace of the cursor on the same clock gives the cursor position at that moment; the sync map says where the beep belongs. Real-time drift must stay ≤ 30 ms for: 100%, 60% and 150% speed (and pitch preserved), a start offset with tempo-warping sync points, a speed change mid-play, seeking mid-play, and loop wraps. Beeps within a short window of a deliberate jump are skipped. Observed: 8–23 ms. The probe is only active when the harness sets `TABKING_E2E`.
- **Manual check** for devices the harness can't cover (Bluetooth or high-latency outputs): play a song with an audible metronome-like recording and confirm the cursor lands on each click; Chromium's `outputLatency` is subtracted but some devices under-report it.
- Run e2e with `npm run test:e2e` (builds first; needs a display, e.g. `xvfb-run`). Native file dialogs are stubbed from the main process. CI integration lands in M7.

## 11. Build and release

### 11.1 Packaging

- electron-builder (`electron-builder.yml`), `npm run dist` builds for the host OS/arch only; native modules (better-sqlite3) are rebuilt per target by building **on a runner of that architecture** (no cross-compiling).
- Artifact names: `tab-king-<version>-<os>-<arch>.<ext>`.

| Target  | Runner             | Arch  | Artifacts                            |
| ------- | ------------------ | ----- | ------------------------------------ |
| Linux   | `ubuntu-24.04`     | x64   | AppImage, deb                        |
| Linux   | `ubuntu-24.04-arm` | arm64 | AppImage, deb                        |
| Windows | `windows-latest`   | x64   | NSIS installer (.exe), portable .exe |
| macOS   | `macos-15-intel`   | x64   | dmg, zip                             |
| macOS   | `macos-latest`     | arm64 | dmg, zip                             |

### 11.2 CI workflow (`.github/workflows/ci.yml`)

On push/PR: `npm ci`, lint, typecheck, unit tests (Linux). Matrix smoke build (`electron-builder --dir`) added in M7.

### 11.3 Release workflow (`.github/workflows/release.yml`)

Triggers: `push` of tags `v*.*.*`, plus manual `workflow_dispatch` (build only, uploads artifacts, **no release**) for dry runs.

1. **verify** job — checks the tag equals `v` + `package.json` version (fail otherwise), and that `CHANGELOG.md` has a section for it.
2. **build** job — matrix over the table above (`fail-fast: false`): checkout, `actions/setup-node` (version from `.nvmrc`, npm cache), `npm ci`, lint/typecheck/test, `npx electron-builder --publish never`, upload the installers with `actions/upload-artifact` (one artifact per matrix entry). Permissions: `contents: read`.
3. **release** job (`needs: [verify, build]`, only on tag push) — downloads all artifacts, writes `SHA256SUMS.txt`, extracts the CHANGELOG section as notes, and runs `gh release create <tag> --verify-tag --notes-file … files…`. Permissions: `contents: write` for this job only. The release is **not** created if any matrix leg fails, so a release never ships a partial set of platforms.
4. Pre-releases: tags containing a hyphen (`v1.2.0-rc.1`) are marked pre-release. Phase tags `v0.x.0` are normal releases, so GitHub's `releases/latest` (used by the in-app update check, ABT-2) works throughout.

Re-running: deleting a failed tag/release and re-pushing the tag, or re-running failed jobs, is safe because release creation is the last step.

### 11.4 Signing and trust

- v1.0 ships **unsigned**; SHA256SUMS published. README documents the Windows SmartScreen prompt and macOS "open anyway"/`xattr -d com.apple.quarantine` steps. macOS arm64 builds are ad-hoc signed (required to run).
- The workflow reads optional secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`) — when present electron-builder signs/notarizes; when absent it builds unsigned. No code change needed later to enable signing.
- Third-party actions pinned to major versions (SHA-pin in M7 hardening); no secrets exposed to PR builds.

### 11.5 Versioning

SemVer in `package.json`; the phase tag table in PROJECT_PLAN gives each milestone's version. Bumping the version and CHANGELOG is part of each phase's wrap-up issue.

## 12. Milestones

| M   | Deliverable                                                                                                                                  | Acceptance                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| M0  | Scaffold, CI, **release pipeline (all 5 build targets)**, frameless window, title bar with File/Help menu bar, left nav flyout, theme tokens | App launches on Linux; menu flyout works; lint/test green; tagged v0.1.0 produces a GitHub Release with installers for every target |
| M1  | DB + migrations, library store, Add/Edit song w/ ID3, Artist tree, context menus                                                             | Add a song with GP+MP3; appears under Artist→Album→Song                                                                             |
| M2  | alphaTab render + synth playback, footer controls, metronome, count-in, loop/select, speed                                                   | Play a GP file; loop 4 bars at 60% with count-in                                                                                    |
| M3  | Multi-track panel: solo/mute/volume, per-track view                                                                                          | Play each track separately                                                                                                          |
| M4  | MP3 engine, offset + sync points, sync editor, stems, source selector, pitch-preserved speed                                                 | MP3 and cursor within 30 ms over a full song; stems switch                                                                          |
| M5  | Search (FTS), playlists, favorites, queue                                                                                                    | Search finds by artist/album/title                                                                                                  |
| M6  | Preferences, backup/restore, help flyout, about + update check                                                                               | Backup→wipe→restore round trip passes                                                                                               |
| M7  | Packaging, release workflow, polish, a11y pass                                                                                               | Installers build on all 3 OSes                                                                                                      |

## 13. Risks

- alphaTab's external-media API is version-specific: the version is pinned (1.8.4) and the behaviour above is covered by e2e tests; re-run the drift test when upgrading.
- Stretch CPU on Raspberry Pi 5 is unmeasured (≈ 1% of a core on a desktop with three sources); see §6.3 for the mitigations if it is CPU-bound.
- Synth and MP3 audio cannot play together (alphaTab external-media has no synth); a future improvement would run a second synth-only instance following the MP3 clock.
- Decoded stems are large (~85 MB each for 4 min stereo); a memory budget with eviction keeps this bounded, but very long songs with many stems may need on-demand loading.
- Frameless resize/drag quirks on some Linux window managers.
- SoundFont size vs. quality trade-off for installer size.

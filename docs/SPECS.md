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
     sync_offset_ms INT DEFAULT 0, duration_ms, created_at, updated_at)
song_track(id PK, song_id FK, track_index INT, name, instrument,
           mp3_path, source TEXT CHECK(source IN ('synth','mp3')) DEFAULT 'synth',
           volume REAL DEFAULT 1, UNIQUE(song_id,track_index))
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
4. On Save, in one operation: copy files to `<library>/<Artist>/<Album>/<Title>/…` (sanitised, collision-suffixed), write cover to `cover.jpg`, insert rows in a transaction; on any failure remove copied files and roll back.

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

### 6.2 alphaTab integration (`src/renderer/player/`)

- `PlayerEngine` class wraps `AlphaTabApi`; React talks only to this wrapper (events → Zustand store).
- Settings: `player.enablePlayer`, `enableCursor`, `enableUserInteraction`, SoundFont loaded from `resources/` via the media protocol; fonts/workers served from app bundle (no CDN).
- Metronome: `api.metronomeVolume`; Count-in: `api.countInVolume` with 3 beats — both 0 when off.
- Loop/select: user drags a range → `api.playbackRange`; `api.isLooping` toggles. Section click uses GP section markers.
- Speed: `api.playbackSpeed` (0.25–2.0).
- Tracks: `api.renderTracks([...])` to display chosen tracks; `api.changeTrackSolo/Mute/Volume` for mixing [TRK-2]. Selecting a single track = solo + render that track; deselect restores the full score [TRK-5].
- Previous/Next: seek to previous/next measure start (or section when sections exist); queue-level song skip with Shift or when at ends [open question 2].

### 6.3 Audio sources and MP3 engine [TRK-3/4, SYN-*]

Per track and for master, `source ∈ {synth, mp3}`.

- **Synth source:** alphaTab's built-in synth; track's MIDI channel unmuted.
- **MP3 source:** alphaTab's _external media_ mode (`ExternalMediaHandler`/backing-track sync): our `Mp3Engine` owns `AudioContext` buffers for the master + stems and implements `play/pause/seek/rate/volume`, reporting its time to alphaTab. alphaTab maps MP3 time → tick via the song's **sync points** (`FlatSyncPoint[]`: bar index, modified tempo, millisecond offset), which handles tempo drift.
- Mixing rule: for each track, exactly one source is audible. Master MP3 on → synth tracks muted unless a track explicitly uses synth; stem MP3 selected → master MP3 muted for that instrument's solo view. Concretely the engine computes `audibleSet` on every change; unit tested.
- **Speed:** synth via `playbackSpeed`; MP3 via time-stretch with pitch preservation (`AudioBufferSourceNode.playbackRate` + SoundTouch/`soundtouchjs` worklet, or `HTMLAudioElement.preservesPitch`). Spike required in M4 to pick; acceptance = no audible pitch change from 50%–150%.
- All stems must be decoded to the same sample rate/length alignment; one shared clock (`AudioContext.currentTime`) drives all stems so they stay sample-aligned. Target drift ≤ 30 ms [SYN-4].

### 6.4 Sync model [SYN-1/2/3/5]

- `sync_offset_ms`: mp3 time at bar 1 beat 1.
- `sync_point(measure, mp3_ms)`: ascending in measure. Between points, tempo is linearly interpolated so measure N lands on `mp3_ms`. Before the first point use the offset; after the last, extrapolate with the last segment's ratio.
- Conversion functions `measureToMp3Ms` / `mp3MsToMeasure` live in `sync-map.ts`, pure and unit tested (round-trip, monotonicity, negative offset).
- **Sync editor** (modal in Edit Song): waveform (wavesurfer.js or canvas) + measure list; "Set here" binds the current MP3 playhead to the selected measure; A/B preview plays tab+MP3 from a chosen measure; nudge ±10 ms buttons; validation rejects non-monotonic points.

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
- SoundFont: choose a permissively licensed GM SoundFont (candidate: check licenses of GeneralUser GS, FluidR3 (MIT-style), Sonatina) before bundling; record in NOTICE.
- CI runs a license checker on production dependencies.

## 10. Testing

- Unit (Vitest): sync-map, audibleSet mixing, repo/queries on in-memory SQLite, filename sanitiser, semver compare.
- Integration: migrations from empty and from each prior version; backup→restore round trip.
- E2E (Playwright-Electron): add song, browse tree, play/loop, preferences theme, backup/restore, about/update (mocked GitHub).
- Manual checklist per platform for frameless window behavior and audio devices.
- Fixtures: small royalty-free GP file + short MP3s in `tests/fixtures/`.

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

- alphaTab external-media/backing-track API details differ by version — spike in M4 and pin the version.
- Pitch-preserving stretch quality/latency for multiple stems; fall back to a single mixed element if CPU-bound on Raspberry Pi.
- Frameless resize/drag quirks on some Linux window managers.
- SoundFont size vs. quality trade-off for installer size.

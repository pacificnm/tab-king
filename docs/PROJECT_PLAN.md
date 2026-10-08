# Tab King — Phased Project Plan

Each phase = one GitHub **milestone**, one **branch**, one **release tag**. Scope and acceptance come from [SPECS §12](SPECS.md) and [REQUIREMENTS](REQUIREMENTS.md). Issues live on GitHub under the matching milestone.

## Phase workflow (applies to every phase)

1. Create branch from up-to-date `main`: `phase/mN-<slug>`.
2. Work the milestone's issues. Commit often (conventional commits, reference `#issue`). Docs are updated in the same branch as the code.
3. Before merging: lint, typecheck and tests green; milestone acceptance criteria demonstrated; CHANGELOG entry added.
4. Open a PR `phase/mN-<slug>` → `main` whose body lists `Closes #…` for every issue in the phase. Merge with a **merge commit** (keeps phase history visible).
5. On `main`: tag the release (the tag push triggers the release workflow, which builds all platforms and publishes the GitHub Release; wait for it to go green before closing the milestone) (`vX.Y.0`, annotated), push the tag, **close the milestone**. Delete the phase branch.
6. Start the next phase from the new `main`.

No phase starts until the previous one is merged and tagged.

## Phases

| Phase | Milestone             | Branch                      | Tag      | Goal                                                                        |
| ----- | --------------------- | --------------------------- | -------- | --------------------------------------------------------------------------- |
| 0     | M0 Scaffold & Shell   | `phase/m0-scaffold`         | `v0.1.0` | Runnable frameless Electron app, CI, themes, nav flyout, File/Help menu bar |
| 1     | M1 Library            | `phase/m1-library`          | `v0.2.0` | DB, add/edit songs with ID3, Artist→Album→Song tree, context menus          |
| 2     | M2 Player Core        | `phase/m2-player-core`      | `v0.3.0` | alphaTab playback, footer, metronome, count-in, loop, speed                 |
| 3     | M3 Multi-track        | `phase/m3-multitrack`       | `v0.4.0` | Track panel, solo/mute/volume, per-track play                               |
| 4     | M4 MP3 Sync           | `phase/m4-mp3-sync`         | `v0.5.0` | MP3 engine, offset + sync points, editor, stems, source select              |
| 5     | M5 Search & Playlists | `phase/m5-search-playlists` | `v0.6.0` | FTS search, playlists, favorites, queue                                     |
| 6     | M6 Preferences & Help | `phase/m6-prefs-help`       | `v0.7.0` | Preferences, backup/restore, help flyout, About + update check              |
| 7     | M7 Release 1.0        | `phase/m7-release`          | `v1.0.0` | Packaging, release workflow, a11y/perf pass, QA on 3 OSes                   |

Baseline tag `v0.0.0` marks the docs-only starting point.

## Phase detail

### M0 — Scaffold & Shell (v0.1.0)

Scaffold electron-vite + React + TS; Tailwind with theme tokens; lint/format/test tooling; CI; **electron-builder config and tag-triggered release workflow building every OS/arch (SPECS §11)**; secure window baseline (preload, CSP); frameless window with custom title bar and controls; resize handling; title-bar File/Help menu bar; left hamburger nav flyout (Search, Play Lists, Favorites, Artists); persisted window bounds.
**Accept:** app launches on Linux; nav flyout and File/Help menus open/close; CI green; pushing `v0.1.0` produces a GitHub Release with Linux x64/arm64, Windows, macOS x64/arm64 installers. Covers WIN-1…5, NFR-4 (baseline), NFR-7.

### M1 — Library (v0.2.0)

SQLite + migration runner + schema 001; repository layer; managed library store and `tabking://` protocol; ID3 reader; Add/Edit/Delete song dialogs; Artist→Album→Song tree (virtualized); context menus; cover art; missing-file handling.
**Accept:** add a song with GP + MP3; it appears under Artist→Album→Song with cover art. Covers LIB-1…8, NAV-1…3, NFR-6.

### M2 — Player Core (v0.3.0)

alphaTab `PlayerEngine` wrapper + store; SoundFont bundling; tab render with cursor; static footer; play/stop/prev/next/seek; metronome; 3-click count-in; select & loop; speed; shortcuts; zoom/layout.
**Accept:** play a GP file; loop 4 bars at 60% with count-in. Covers PLY-1…7, PLY-9.

### M3 — Multi-track (v0.4.0)

Track panel; solo/mute/volume; single-track view/play; MIDI-file source option.
**Accept:** each track plays alone and returns to the full mix. Covers TRK-1, 2, 5, 6.

### M4 — MP3 Sync (v0.5.0)

Spikes (pitch-preserving stretch, alphaTab external media); `Mp3Engine`; sync-map math; offset; sync points; sync editor with waveform; master + per-track MP3s; source selector and mixing rules; drift test.
**Accept:** MP3 and cursor within 30 ms across a full song; stems switch cleanly; speed change keeps pitch. Covers TRK-3, 4, SYN-1…5, PLY-6 (MP3).

### M5 — Search & Playlists (v0.6.0)

FTS5 index and triggers; search UI; playlist CRUD and reorder; favorites; queue playback.
**Accept:** search finds by title/artist/album; album/playlist plays through. Covers NAV-4…6, PLY-8, NFR-3.

### M6 — Preferences & Help (v0.7.0)

Preferences dialog; themes; folder locations with migration; audio prefs; backup; restore; help flyout with TOC; About modal; GitHub update check.
**Accept:** backup → wipe → restore round trip passes. Covers PRF-1…3, BKP-1/2, HLP-1, ABT-1/2.

### M7 — Release 1.0 (v1.0.0)

signing hooks and smoke-test of installers, SHA-pinned actions; accessibility pass; performance pass; e2e suite; license audit and NOTICE; cross-platform manual QA; user docs.
**Accept:** installers build and run on Linux x64/ARM64, Windows, macOS; GitHub Release published. Covers NFR-1, 2, 5, 7, 8.

## Labels

`phase:m0`…`phase:m7`, area labels (`area:shell`, `area:db`, `area:library`, `area:player`, `area:audio`, `area:sync`, `area:ui`, `area:build`, `area:docs`), `spike`, plus GitHub defaults (`enhancement`, `bug`, `documentation`).

# Changelog

All notable changes to Tab King. Format: [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

## [0.4.0] - 2026-10-08

### Added

- Track panel listing every Guitar Pro track with its name and instrument; songs now show all tracks by default.
- Per-track solo, mute and volume (0–150%), saved per song and restored on reopening (migration 002).
- Single-track practice view: render and play one track alone, then "Back to full mix" restores the score and your exact mix.
- Optional attached MIDI file as the synth's note source, switchable per song (Standard MIDI File parser; keeps the tab's tempo, metronome and cursor).
- e2e scenarios for track listing, practice view, mix persistence across a restart, and the MIDI source.

### Fixed

- The bundled SoundFont could be silently dropped if it finished downloading before the first score had loaded, leaving the player stuck "not ready". alphaTab now loads it itself (`player.soundFont`).

### Notes

- With the MIDI source the cursor follows the tab's timing, so use a MIDI file exported from the same tab. MP3 stems join the practice view in M4.

## [0.3.0] - 2026-10-08

### Added

- Tab and notation rendering with a moving cursor, auto-scroll, and click-to-seek (alphaTab, pinned to 1.8.4).
- Synth playback with a bundled GM SoundFont (Sonivox EAS, Apache-2.0) and bundled Bravura music font, served through the `tabking://app/` protocol host.
- Static footer: play/pause, stop, previous/next measure, seek bar, time and measure readout.
- Metronome with on/off and volume; 3-click count-in with on/off.
- Select-and-loop: drag-select on the tab, type a bar range, or pick a section marker; Loop toggle; Clear selection.
- Speed 25–200% in 5% steps with reset; master volume.
- Keyboard shortcuts: Space, Home, `[` `]`, L, M, C.
- Tab zoom (50–200%) and Page/Horizontal layout toggle.
- `NOTICE` file with third-party attributions.
- Player e2e scenarios, including a 2-bar loop at 60% with count-in.

### Changed

- Play (button, double-click, context menu, Enter) now opens the song in the player. Play on an artist or album opens its first song; queue playback arrives with playlists (M5).
- Play is blocked with a clear message only when the Guitar Pro file is missing; a missing MP3 or cover no longer prevents playback.
- The `tabking://` scheme is now CORS-enabled (the page origin is `file://`).

### Notes

- Instrument/MP3 modes, track mixing and MP3 sync arrive in M3/M4. Metronome, count-in, zoom and layout settings are not persisted yet (preferences land in M6).

## [0.2.0] - 2026-10-08

### Added

- SQLite library database (better-sqlite3) with a transactional migration runner and an automatic backup before migrating; schema 001.
- Typed repository layer for artists, albums, songs, tracks and settings.
- Managed library folder: selected files are copied to `<Artist>/<Album>/<Title>/` with sanitised, collision-safe names; failed saves roll back.
- `tabking://` media protocol with path-traversal protection and range requests.
- ID3 reader (music-metadata) for title, artist, album, year, track, genre, duration and embedded cover art.
- Add Song / Edit Song dialogs: Guitar Pro (required), MIDI, master MP3 and per-track MP3s; GP and ID3 prefill the form (ID3 wins, user edits win over both).
- Delete song with optional removal of its copied files.
- Hamburger flyout library navigation with a virtualized, keyboard-navigable Artist → Album → Song tree.
- Right-click context menus (Add, Edit, Play; Delete for songs) on artists, albums and songs; rename artist and edit album.
- Album cover art in the tree and song view, with placeholders.
- Missing-file reporting: the song view lists missing files and Play explains what is missing instead of failing.
- Playwright-Electron end-to-end tests (`npm run test:e2e`).

### Changed

- The Artists flyout item now expands in place instead of opening a placeholder view.

### Notes

- Play is a stub until M2 (player core); Search, Play Lists and Favorites arrive in M5.

## [0.1.0] - 2026-10-08

### Added

- Electron + React + TypeScript + Tailwind project scaffold (electron-vite).
- Frameless window with custom title bar (hamburger, minimize, maximize/restore, close).
- Title-bar menu bar: File (Preferences, Backup/Restore) and Help (Help Contents, About); entries are stubs until M6.
- Left hamburger flyout with library navigation: Search, Play Lists, Favorites, Artists (views are placeholders until M1/M5).
- Theme tokens (light/dark, follows system) via CSS variables.
- Secure window baseline: context isolation, sandboxed preload, typed IPC, CSP, navigation lockdown.
- Persisted window size, position and maximized state.
- Tooling: ESLint, Prettier, Vitest; CI workflow.
- electron-builder config and tag-triggered release workflow for Linux x64/arm64, Windows x64, macOS x64/arm64.

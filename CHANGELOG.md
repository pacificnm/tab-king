# Changelog

All notable changes to Tab King. Format: [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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

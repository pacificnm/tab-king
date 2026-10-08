# Changelog

All notable changes to Tab King. Format: [Keep a Changelog](https://keepachangelog.com/), versions follow [SemVer](https://semver.org/).

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

# Tab King

A desktop guitar tab player in the spirit of [Songsterr](https://www.songsterr.com/): load Guitar Pro files, play them with a synth or with synced MP3 tracks, loop sections, slow them down, and practice.

Single-user, offline-first, open source (Apache-2.0).

> Status: **in development** (v0.7.0: library with search, favorites and play lists; synth playback, track mixing and practice; MP3 playback synced to the tab with a sync editor; queue playback; preferences with themes, folders and audio settings; backup/restore; built-in help and About with an update check). The 1.0 polish and release pass comes next. See [docs/](docs/) and [CHANGELOG.md](CHANGELOG.md).

## Features (planned)

- Guitar Pro (GP3–GP8) tab and notation rendering, scrolling cursor
- Synth/MIDI playback with speed control; per-track mute/solo/volume
- Master MP3 plus per-instrument MP3 stems, synced to the tab via start offset and bar sync points
- Metronome click, 3-click count-in, select-and-loop of measures/sections
- Library built from ID3 tags (album art, artist, album, title); Search, Playlists, Favorites, Artist → Album → Song browsing
- Frameless window with custom title bar, hamburger library-navigation flyout, File/Help menu bar, right-side help flyout
- Themes, configurable folders, backup/restore, in-app update check against GitHub releases

## Stack

Electron · React · TypeScript · Tailwind CSS · SQLite (better-sqlite3) · alphaTab · Vite

## Platforms

Linux (x64, ARM64), Windows, macOS.

## Documentation

| Doc                                          | Purpose                                                    |
| -------------------------------------------- | ---------------------------------------------------------- |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | What the app must do (numbered, testable)                  |
| [docs/SPECS.md](docs/SPECS.md)               | How it is built: architecture, data model, UI, sync design |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Phased plan, branch/merge/tag workflow                     |
| [CLAUDE.md](CLAUDE.md)                       | Guidance for Claude Code working in this repo              |
| [PROMPT.md](PROMPT.md)                       | Original project brief                                     |

## Development

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run dev          # run with hot reload
npm test             # unit tests (Vitest)
npm run test:e2e     # Electron end-to-end tests (Playwright; needs a display)
npm run lint && npm run typecheck
npm run dist:dir     # unpacked package for the host platform
npm run dist         # installers for the host platform
```

If you launch from an Electron-hosted terminal (e.g. VS Code), `unset ELECTRON_RUN_AS_NODE` first.

Releases: bump `version` in `package.json`, add a `CHANGELOG.md` section, then push a matching `vX.Y.Z` tag. The release workflow builds Linux (x64, arm64), Windows (x64) and macOS (x64, arm64) and publishes a GitHub Release.

## License

[Apache License 2.0](LICENSE). Third-party notices are in [NOTICE](NOTICE): alphaTab (MPL-2.0), Electron (MIT), React (MIT), the bundled Sonivox SoundFont (Apache-2.0) and Bravura font (SIL OFL).

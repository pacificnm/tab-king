# Tab King

A desktop guitar tab player in the spirit of [Songsterr](https://www.songsterr.com/): load Guitar Pro files, play them with a synth or with synced MP3 tracks, loop sections, slow them down, and practice.

Single-user, offline-first, open source (Apache-2.0).

> Status: **specification phase**. No code yet. See [docs/](docs/).

## Features (planned)

- Guitar Pro (GP3–GP8) tab and notation rendering, scrolling cursor
- Synth/MIDI playback with speed control; per-track mute/solo/volume
- Master MP3 plus per-instrument MP3 stems, synced to the tab via start offset and bar sync points
- Metronome click, 3-click count-in, select-and-loop of measures/sections
- Library built from ID3 tags (album art, artist, album, title); Search, Playlists, Favorites, Artist → Album → Song browsing
- Frameless window with custom title bar, hamburger flyout menu, right-side help flyout
- Themes, configurable folders, backup/restore, in-app update check against GitHub releases

## Stack

Electron · React · TypeScript · Tailwind CSS · SQLite (better-sqlite3) · alphaTab · Vite

## Platforms

Linux (x64, ARM64), Windows, macOS.

## Documentation

| Doc | Purpose |
| --- | --- |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | What the app must do (numbered, testable) |
| [docs/SPECS.md](docs/SPECS.md) | How it is built: architecture, data model, UI, sync design |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Phased plan, branch/merge/tag workflow |
| [CLAUDE.md](CLAUDE.md) | Guidance for Claude Code working in this repo |
| [PROMPT.md](PROMPT.md) | Original project brief |

## Development

Not yet scaffolded. Planned commands: `npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run dist`.

## License

[Apache License 2.0](LICENSE). Third-party notices: alphaTab (MPL-2.0), Electron (MIT), React (MIT). A SoundFont bundled for the synth must be license-compatible (see SPECS §9).

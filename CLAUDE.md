# CLAUDE.md

Guidance for Claude Code in this repo. Read [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) and [docs/SPECS.md](docs/SPECS.md) before changing behavior; keep them updated in the same change as the code.

## Project

Tab King: Electron desktop guitar-tab player (Songsterr-like). Single user, offline, Apache-2.0. Repo: github.com/pacificnm/tab-king.

## Stack and decisions (fixed)

- Electron + React + TypeScript + Tailwind, built with Vite (electron-vite).
- SQLite via better-sqlite3, in the **main process only**.
- alphaTab for GP parsing, rendering, synth, cursor, looping, metronome, count-in, and external-media (MP3) sync.
- ID3 via music-metadata.
- Frameless window (`frame: false`); custom title bar and flyouts are our own React components.
- Library files are **copied** into a managed library folder; the DB stores relative paths.

## Architecture rules

- Renderer has no Node access: `contextIsolation: true`, `nodeIntegration: false`. All OS/DB/file access goes through a typed preload IPC API (`window.api`). Validate every IPC payload in main.
- Schema changes only via numbered migrations in `src/main/db/migrations/`. Never edit a shipped migration.
- Audio/playback logic lives in `src/renderer/player/`; UI components must not talk to alphaTab directly.
- Keep modules small; shared types in `src/shared/`.

## Conventions

- TypeScript strict; no `any` without a comment.
- Tailwind utilities with theme tokens (CSS variables) — no hard-coded colors.
- Tests: Vitest for unit, Playwright for Electron e2e. Add tests with features.
- Commits: conventional commits (`feat:`, `fix:`, `docs:`...).
- Don't add dependencies without checking their license is Apache-2.0-compatible.

## Commands (once scaffolded)

`npm run dev` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run build` · `npm run dist`

## Workflow

Docs first, then code. Follow [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md): one GitHub milestone per phase (M0–M7), each on its own branch `phase/mN-<slug>`.

1. Branch from up-to-date `main`; work the milestone's issues; commit with `#issue` references.
2. Lint/typecheck/tests green and acceptance criteria met; update docs and CHANGELOG.
3. PR to `main` with `Closes #…` for every phase issue; merge commit.
4. Tag `vX.Y.0` on `main` (annotated) after bumping `package.json` + CHANGELOG; the tag push runs `.github/workflows/release.yml` (builds Linux x64/arm64, Windows, macOS x64/arm64 and publishes the Release). Once it is green, close the milestone and delete the branch.
5. Don't start the next phase until the previous is merged and tagged.

# Tab King — Requirements

Priority: **M** = must (v1), **S** = should (v1 if time), **C** = could (later).
Source: [PROMPT.md](../PROMPT.md) plus decisions recorded in §10.

## 1. Scope

Single-user, offline desktop app for Linux (x64, ARM64), Windows and macOS that plays Guitar Pro tabs with synth and/or synced MP3 audio. No accounts, no cloud, no online tab catalogue.

## 2. Window and shell

| ID    | Requirement                                                                                                                                                                                 | P   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| WIN-1 | Native window decoration is disabled (frameless).                                                                                                                                           | M   |
| WIN-2 | Custom title bar: hamburger icon (left), app title, **File / Help menu bar** immediately right of the title, and minimize/maximize/close buttons; draggable; double-click toggles maximize. | M   |
| WIN-3 | Hamburger opens a **left flyout** containing the library navigation only (see NAV-1). Closes on outside click or Esc.                                                                       | M   |
| WIN-6 | Title-bar menu bar: **File** → Preferences, Backup/Restore; **Help** → Help Contents, About. Drop-downs are keyboard operable (arrows, Enter, Esc) and open on click.                       | M   |
| WIN-4 | Window size/position/maximized state persist across launches.                                                                                                                               | S   |
| WIN-5 | Resizing, snapping, and edge-drag work on all platforms despite frameless.                                                                                                                  | M   |

## 3. Navigation and library

| ID    | Requirement                                                                                                                                                                                               | P   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| NAV-1 | Hamburger flyout (library navigation) has top-level items, in order: **Search, Play Lists, Favorites, Artists**.                                                                                          | M   |
| NAV-2 | Artist expands to Albums, which expand to Songs (tree).                                                                                                                                                   | M   |
| NAV-3 | Every menu item (artist, album, song, playlist) has a right-click context menu with **Add, Edit, Play** (Delete where applicable).                                                                        | M   |
| NAV-4 | Search matches title, artist, album and tags as you type (full-text), results grouped by type.                                                                                                            | M   |
| NAV-5 | Favorites: toggle via heart on a song; Favorites view lists them.                                                                                                                                         | M   |
| NAV-6 | Playlists: create/rename/delete, add/remove songs, reorder, play all (queue).                                                                                                                             | M   |
| LIB-1 | Songs are added **manually** via Add dialog (no folder scanning in v1).                                                                                                                                   | M   |
| LIB-2 | A song has: one GP file (required), optional MIDI file, optional master MP3, and optional MP3 per GP track.                                                                                               | M   |
| LIB-3 | On add, ID3 tags (title, artist, album, year, track no., genre, embedded cover art) are read from the master MP3 and prefill the form; the user can edit all fields. If no MP3, fall back to GP metadata. | M   |
| LIB-4 | Selected files are **copied** into the managed library folder; DB stores relative paths.                                                                                                                  | M   |
| LIB-5 | Album art is extracted from ID3 and shown in the tree, song header and player; placeholder if none.                                                                                                       | M   |
| LIB-6 | Edit song: change metadata, replace/remove any attached file, edit sync settings.                                                                                                                         | M   |
| LIB-7 | Delete song removes DB rows and (after confirmation) its copied files.                                                                                                                                    | M   |
| LIB-8 | Missing/corrupt files are reported with a clear message; the app never crashes on them.                                                                                                                   | M   |

## 4. Player

| ID    | Requirement                                                                                                                            | P   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | --- |
| PLY-1 | Main screen renders the GP tab/notation with a moving cursor; auto-scrolls; click a measure/beat to seek.                              | M   |
| PLY-2 | **Static footer** with Play/Pause, Stop, Previous and Next (measure/section; song when in queue), time/measure readout, and seek bar.  | M   |
| PLY-3 | **Metronome**: audible click on beats, on/off toggle, volume.                                                                          | M   |
| PLY-4 | **Count-in**: 3-click (configurable 1–4 later) before playback, on/off toggle.                                                         | M   |
| PLY-5 | **Select & loop**: drag-select measures (or click a section marker) to define a range; loop on/off; loop survives seeks until cleared. | M   |
| PLY-6 | **Speed control** 25%–200% (step 5%), reset to 100%. Applies to synth/MIDI and, per audio-mode decision, to MP3 with pitch preserved.  | M   |
| PLY-7 | Keyboard shortcuts: Space play/pause, Home restart, [ ] speed, L loop, M metronome, C count-in.                                        | S   |
| PLY-8 | Queue playback: next song auto-starts when playing an album/playlist.                                                                  | S   |
| PLY-9 | Zoom tab layout; page vs. horizontal-scroll layout toggle.                                                                             | S   |

## 5. Multi-track and audio

| ID    | Requirement                                                                                                          | P   |
| ----- | -------------------------------------------------------------------------------------------------------------------- | --- |
| TRK-1 | Every GP track is listed in a track panel with name/instrument.                                                      | M   |
| TRK-2 | Each track can be **played separately**: solo, mute, and volume per track.                                           | M   |
| TRK-3 | A song has one **master MP3** plus **optional MP3 per track**.                                                       | M   |
| TRK-4 | For the master and each track the user selects the audio source: **Synth/MIDI** or **MP3** (when attached).          | M   |
| TRK-5 | Selecting a single track to practice shows/plays that track's MP3 or synth only; master mix is restored on deselect. | M   |
| TRK-6 | A MIDI file, if attached, can be used as the synth source instead of the GP-derived MIDI.                            | S   |

## 6. MP3 ↔ GP sync

| ID    | Requirement                                                                                                         | P   |
| ----- | ------------------------------------------------------------------------------------------------------------------- | --- |
| SYN-1 | Per-song **start offset** (ms, may be negative) aligns MP3 time 0 to GP bar 1.                                      | M   |
| SYN-2 | Optional **sync points** map specific measures to MP3 timestamps, correcting tempo drift between recording and tab. | M   |
| SYN-3 | Sync editor: play MP3, tap/set the MP3 time for a chosen measure; edit/delete points; preview.                      | M   |
| SYN-4 | Playing, seeking, looping and speed change keep tab cursor and MP3 within ~30 ms of each other.                     | M   |
| SYN-5 | Stems of one song share the same sync map (one map per song, not per stem).                                         | M   |
| SYN-6 | Automatic beat alignment.                                                                                           | C   |

## 7. Preferences, backup, help, about

| ID    | Requirement                                                                                                                                                                                                     | P   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| PRF-1 | Preferences dialog with **Themes**: light, dark, system, plus at least 2 accent/color themes. Applied live.                                                                                                     | M   |
| PRF-2 | Preferences for **file/folder locations**: library folder, backup folder (change with folder picker; moving library offers to migrate files).                                                                   | M   |
| PRF-3 | Preferences for audio: output device, default metronome/count-in state, soundfont selection.                                                                                                                    | S   |
| BKP-1 | **Backup** produces one archive (.zip) containing the DB and all library files plus manifest/version.                                                                                                           | M   |
| BKP-2 | **Restore** from archive after confirmation; validates manifest and schema version; rollback on failure.                                                                                                        | M   |
| HLP-1 | Help → Help Contents opens a **right-side flyout** with a table of contents; selecting an entry shows that topic (bundled Markdown).                                                                            | M   |
| ABT-1 | Help → About opens a **modal** with app name, version, license, links.                                                                                                                                          | M   |
| ABT-2 | About has a **Check for updates** button that queries GitHub Releases (`pacificnm/tab-king`) and reports up-to-date or the newer version with a link. No automatic install in v1; no check without user action. | M   |

## 8. Non-functional

| ID    | Requirement                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| NFR-1 | Offline: no network access except the explicit update check.                                                      |
| NFR-2 | Startup to interactive < 3 s on x64; usable on Raspberry Pi 5 (ARM64).                                            |
| NFR-3 | Library of 5,000 songs: tree/search respond < 200 ms.                                                             |
| NFR-4 | Security: context isolation, no Node in renderer, validated IPC, CSP set, no remote content loaded.               |
| NFR-5 | Accessibility: keyboard-navigable menus/dialogs, visible focus, contrast AA in all themes.                        |
| NFR-6 | Data safety: DB migrations are versioned and run in a transaction; an automatic DB copy is made before migrating. |
| NFR-7 | Packaging via electron-builder: AppImage+deb (Linux x64/arm64), NSIS (Windows), dmg (macOS).                      |
| NFR-8 | All dependencies and bundled assets (incl. SoundFont) are Apache-2.0-compatible.                                  |

## 9. Out of scope (v1)

Folder scanning/watching, cloud sync, multi-user, tab editing/authoring, online tab search, auto-update installation, mobile, MIDI device input, tuner.

## 10. Decisions log

| Decision      | Choice                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| License       | Apache-2.0 (permissive, patent grant, compatible with alphaTab MPL-2.0 and Electron MIT)                                       |
| Tab engine    | alphaTab                                                                                                                       |
| MP3 sync      | Start offset + measure sync points                                                                                             |
| Audio modes   | Per-track choice of synth/MIDI or MP3; speed works for both (pitch-preserved for MP3). Synth and MP3 can't sound together (v1) |
| Platforms     | Linux x64/ARM64, Windows, macOS                                                                                                |
| Import        | Manual add only                                                                                                                |
| File storage  | Copied into managed library folder                                                                                             |
| Library scope | Standard: full-text search, ordered playlists, favorites, queue                                                                |
| Count-in      | Exactly 3 audible clicks at the song tempo (and current speed), then playback starts                                           |

## 11. Open questions

1. ~~Which SoundFont to bundle?~~ **Resolved (M2):** the Sonivox EAS GM bank (`sonivox.sf3`, ~1 MB) distributed with alphaTab, licensed Apache-2.0 by Sonic Network Inc.; recorded in `NOTICE`. PRF-3 (soundfont selection) can add user-chosen SoundFonts later.
2. ~~Should Previous/Next move by measure, section, or song?~~ **Resolved (M2):** by measure. Previous restarts the current measure unless playback is within half a beat of its start, then goes to the previous measure. Songs/sections are reached via the tree and the section picker; queue-level song skip arrives with PLY-8 (M5).
3. Is app-level undo needed for library edits? Assumed no.

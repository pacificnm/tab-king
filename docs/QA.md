# Manual QA checklist

Run before every release (and fill in the table in the release PR). Automated tests cover logic, UI flows, accessibility audits and packaged-app start-up on Linux, Windows and macOS runners; this list is for what machines can't judge: real audio devices, window-manager behaviour and installer experience.

Use a build from the release workflow (dry run or tag), not a development build. Use a song with a GP file **and** a master MP3, and one with stems.

| #   | Check                                                                                                                                                     | Linux x64 | Linux ARM64 | Windows | macOS Intel | macOS ARM |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- | ------- | ----------- | --------- |
| 1   | Installer / package installs and the app starts; icon and name are right in the launcher, task bar and window                                             |           |             |         |             |           |
| 2   | Frameless window: drag by the title bar, resize from every edge and corner, minimise, maximise/restore, close; double-click the bar maximises             |           |             |         |             |           |
| 3   | Window size, position and maximised state are remembered after a restart; a window left on a disconnected monitor reappears on screen                     |           |             |         |             |           |
| 4   | Add a song (GP + MP3): tags, cover art and track list fill in; it appears in Artists → Album → Song                                                       |           |             |         |             |           |
| 5   | Play: sound comes out, cursor follows, auto-scroll works; pause, stop, seek by clicking a bar                                                             |           |             |         |             |           |
| 6   | Metronome and 3-click count-in audible; loop 4 bars at 60 % with count-in                                                                                 |           |             |         |             |           |
| 7   | MP3 mode: cursor lands on the beats of a click-track recording through the speakers (and, if available, a Bluetooth device — expect a small offset)       |           |             |         |             |           |
| 8   | Speed 50 % and 150 % with MP3: pitch is unchanged, no clicks or dropouts for a full song                                                                  |           |             |         |             |           |
| 9   | Stems: each track alone, then the full mix; solo/mute/volume                                                                                              |           |             |         |             |           |
| 10  | Preferences: change theme (all five); change the output device to a second device mid-song; choose a SoundFont and back                                   |           |             |         |             |           |
| 11  | Change the library folder with "copy files"; songs still play; remove the old files                                                                       |           |             |         |             |           |
| 12  | Backup, delete a song, restore: the song is back after the restart                                                                                        |           |             |         |             |           |
| 13  | Help flyout opens, topics and links work; About shows the right version; Check for updates reports sensibly (also with the network off)                   |           |             |         |             |           |
| 14  | Keyboard only: reach every menu and dialog, no focus trap that can't be left; screen reader announces the menus and buttons (Orca / Narrator / VoiceOver) |           |             |         |             |           |
| 15  | Start-up to a usable window in under 3 s on a cold start; Raspberry Pi 5: playback of a synth song and an MP3 song is smooth at 100 % and 60 % speed      |           |             |         |             |           |
| 16  | Uninstall removes the app (the library in your user data is kept)                                                                                         |           |             |         |             |           |

## Last run

| Release | Date | Who | Results / notes |
| ------- | ---- | --- | --------------- |
| v1.0.0  |      |     |                 |

Record failures as GitHub issues (label `bug`, milestone of the next release).

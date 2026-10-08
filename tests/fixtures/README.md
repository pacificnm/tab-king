# Test fixtures

Small deterministic audio used by the end-to-end tests. Each file is 24 s of mono 44.1 kHz MP3 (48 kbps) containing a
50 ms sine beep every 500 ms (120 bpm), so beeps land on every beat of the 120 bpm test tab:

| File                | Tone    | Role                  |
| ------------------- | ------- | --------------------- |
| `master-24s.mp3`    | 1000 Hz | master mix            |
| `stem-lead-24s.mp3` | 440 Hz  | stem for track "Lead" |
| `stem-bass-24s.mp3` | 110 Hz  | stem for track "Bass" |

Regenerate with ffmpeg:

```bash
gen() { ffmpeg -y -f lavfi -i "aevalsrc='sin(2*PI*$2*t)*lt(mod(t,0.5),0.05)':s=44100:d=24" -ac 1 -b:a 48k -id3v2_version 3 -metadata title="$3" -metadata artist="Test" -metadata album="Fixtures" "$1"; }
gen master-24s.mp3 1000 "Master"; gen stem-lead-24s.mp3 440 "Lead stem"; gen stem-bass-24s.mp3 110 "Bass stem"
```

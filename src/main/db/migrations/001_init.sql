CREATE TABLE artist (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE album (
  id         INTEGER PRIMARY KEY,
  artist_id  INTEGER NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  year       INTEGER,
  cover_path TEXT,
  UNIQUE (artist_id, title)
);

CREATE TABLE song (
  id              INTEGER PRIMARY KEY,
  album_id        INTEGER REFERENCES album(id) ON DELETE SET NULL,
  artist_id       INTEGER NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  track_no        INTEGER,
  genre           TEXT,
  year            INTEGER,
  gp_path         TEXT NOT NULL,
  midi_path       TEXT,
  master_mp3_path TEXT,
  master_source   TEXT NOT NULL DEFAULT 'synth' CHECK (master_source IN ('synth', 'mp3')),
  sync_offset_ms  INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX song_artist_idx ON song(artist_id);
CREATE INDEX song_album_idx ON song(album_id);

CREATE TABLE song_track (
  id          INTEGER PRIMARY KEY,
  song_id     INTEGER NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  track_index INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  instrument  TEXT,
  mp3_path    TEXT,
  source      TEXT NOT NULL DEFAULT 'synth' CHECK (source IN ('synth', 'mp3')),
  volume      REAL NOT NULL DEFAULT 1,
  UNIQUE (song_id, track_index)
);

CREATE TABLE sync_point (
  id      INTEGER PRIMARY KEY,
  song_id INTEGER NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  measure INTEGER NOT NULL,
  mp3_ms  INTEGER NOT NULL,
  UNIQUE (song_id, measure)
);

CREATE TABLE playlist (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE playlist_song (
  playlist_id INTEGER NOT NULL REFERENCES playlist(id) ON DELETE CASCADE,
  song_id     INTEGER NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE favorite (
  song_id    INTEGER PRIMARY KEY REFERENCES song(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);

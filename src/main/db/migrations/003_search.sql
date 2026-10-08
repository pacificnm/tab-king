-- Full-text index over the searchable text of a song (NAV-4). One row per song, rowid = song.id.
-- Artist/album names live in other tables, so triggers keep the index in step with all three.
CREATE VIRTUAL TABLE song_fts USING fts5(
  title, artist, album, genre,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

INSERT INTO song_fts (rowid, title, artist, album, genre)
SELECT s.id, s.title, ar.name, COALESCE(al.title, ''), COALESCE(s.genre, '')
FROM song s
JOIN artist ar ON ar.id = s.artist_id
LEFT JOIN album al ON al.id = s.album_id;

CREATE TRIGGER song_fts_ai AFTER INSERT ON song BEGIN
  INSERT INTO song_fts (rowid, title, artist, album, genre)
  SELECT s.id, s.title, ar.name, COALESCE(al.title, ''), COALESCE(s.genre, '')
  FROM song s
  JOIN artist ar ON ar.id = s.artist_id
  LEFT JOIN album al ON al.id = s.album_id
  WHERE s.id = new.id;
END;

CREATE TRIGGER song_fts_au AFTER UPDATE ON song BEGIN
  DELETE FROM song_fts WHERE rowid = old.id;
  INSERT INTO song_fts (rowid, title, artist, album, genre)
  SELECT s.id, s.title, ar.name, COALESCE(al.title, ''), COALESCE(s.genre, '')
  FROM song s
  JOIN artist ar ON ar.id = s.artist_id
  LEFT JOIN album al ON al.id = s.album_id
  WHERE s.id = new.id;
END;

CREATE TRIGGER song_fts_ad AFTER DELETE ON song BEGIN
  DELETE FROM song_fts WHERE rowid = old.id;
END;

-- Renaming an artist or album changes the indexed text of every song under it.
CREATE TRIGGER artist_fts_au AFTER UPDATE OF name ON artist BEGIN
  DELETE FROM song_fts WHERE rowid IN (SELECT id FROM song WHERE artist_id = new.id);
  INSERT INTO song_fts (rowid, title, artist, album, genre)
  SELECT s.id, s.title, ar.name, COALESCE(al.title, ''), COALESCE(s.genre, '')
  FROM song s
  JOIN artist ar ON ar.id = s.artist_id
  LEFT JOIN album al ON al.id = s.album_id
  WHERE s.artist_id = new.id;
END;

CREATE TRIGGER album_fts_au AFTER UPDATE OF title ON album BEGIN
  DELETE FROM song_fts WHERE rowid IN (SELECT id FROM song WHERE album_id = new.id);
  INSERT INTO song_fts (rowid, title, artist, album, genre)
  SELECT s.id, s.title, ar.name, COALESCE(al.title, ''), COALESCE(s.genre, '')
  FROM song s
  JOIN artist ar ON ar.id = s.artist_id
  LEFT JOIN album al ON al.id = s.album_id
  WHERE s.album_id = new.id;
END;

-- Listing a playlist or the favorites joins on these.
CREATE INDEX playlist_song_order_idx ON playlist_song (playlist_id, position);

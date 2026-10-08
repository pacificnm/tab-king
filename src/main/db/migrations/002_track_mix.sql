-- Per-track mix state, persisted per song (TRK-2).
ALTER TABLE song_track ADD COLUMN muted INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0, 1));
ALTER TABLE song_track ADD COLUMN solo INTEGER NOT NULL DEFAULT 0 CHECK (solo IN (0, 1));

-- Which source the synth plays notes from: the tab-derived MIDI or the attached MIDI file (TRK-6).
ALTER TABLE song ADD COLUMN synth_source TEXT NOT NULL DEFAULT 'gp' CHECK (synth_source IN ('gp', 'midi'));

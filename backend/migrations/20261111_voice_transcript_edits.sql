-- Additive and repeatable. Existing notes are captured lazily on their first edit,
-- including NULL originals for audio-only notes. The timestamp distinguishes NULL
-- originals from notes that have never been edited.
BEGIN;
ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS original_transcript TEXT,
  ADD COLUMN IF NOT EXISTS transcript_edited_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS voice_note_transcript_revisions (
  id BIGSERIAL PRIMARY KEY,
  voice_note_id UUID NOT NULL REFERENCES voice_notes(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  previous_transcript TEXT,
  transcript TEXT NOT NULL CHECK (length(btrim(transcript)) > 0 AND length(transcript) <= 50000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voice_transcript_revisions_note
  ON voice_note_transcript_revisions(voice_note_id, id DESC);
COMMIT;

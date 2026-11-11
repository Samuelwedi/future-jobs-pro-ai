import { pool } from '../config/database';

export class TranscriptEditError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// The caller supplies only the verified token's user id, never its role/company claims.
// Row locks keep authorization and the comparison valid through the audit + update.
export async function editVoiceTranscript(userId: string, noteId: string, transcript: string, expectedTranscript: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = await client.query(`SELECT id, company_id FROM users
      WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE FOR SHARE`, [userId]);
    if (!actor.rowCount || !actor.rows[0].company_id) throw new TranscriptEditError(401, 'Not authenticated');
    const noteResult = await client.query(`SELECT * FROM voice_notes
      WHERE id = $1 AND user_id = $2 AND company_id = $3 FOR UPDATE`,
    [noteId, userId, actor.rows[0].company_id]);
    if (!noteResult.rowCount) throw new TranscriptEditError(404, 'Voice note not found');
    const note = noteResult.rows[0];
    const project = await client.query(`SELECT id FROM projects WHERE id = $1 AND company_id = $2 FOR SHARE`,
      [note.project_id, actor.rows[0].company_id]);
    if (!project.rowCount) throw new TranscriptEditError(404, 'Voice note not found');

    // Recognize a retry only when it matches the most recent committed transition.
    // Revalidate author/company/project even for this read-only success path.
    const latest = await client.query(`SELECT previous_transcript, transcript, actor_id
      FROM voice_note_transcript_revisions WHERE voice_note_id = $1 ORDER BY id DESC LIMIT 1`, [noteId]);
    const revision = latest.rows[0];
    const retry = note.transcript === transcript && revision && revision.actor_id === userId &&
      (revision.previous_transcript ?? '') === expectedTranscript && revision.transcript === transcript;
    if (!retry) {
      if ((note.transcript ?? '') !== expectedTranscript) {
        throw new TranscriptEditError(409, 'Transcript changed. Reload the note before editing.');
      }
      await client.query(`INSERT INTO voice_note_transcript_revisions
        (voice_note_id, actor_id, company_id, previous_transcript, transcript)
        VALUES ($1, $2, $3, $4, $5)`, [noteId, userId, actor.rows[0].company_id, note.transcript, transcript]);
      await client.query(`UPDATE voice_notes SET
        original_transcript = CASE WHEN transcript_edited_at IS NULL THEN transcript ELSE original_transcript END,
        transcript = $2, transcript_edited_at = NOW(), client_summary = NULL, structured_data = NULL,
        metadata = (CASE WHEN jsonb_typeof(metadata) = 'object' THEN metadata ELSE '{}'::jsonb END)
          || '{"structured":null,"structuredData":null,"structured_data":null,"clientSummary":null,"client_summary":null,"tags":[],"transcriptionStatus":"edited"}'::jsonb
        WHERE id = $1`, [noteId, transcript]);
    }
    await client.query('COMMIT');
    return { success: true, voiceNoteId: noteId, transcript, clientSummary: null,
      structuredData: null, tags: [], transcriptionStatus: 'edited' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// A single read statement applies the same current database authorization as edits.
// Never return derived content here: clients use this only to reconcile a baseline.
export async function readVoiceTranscript(userId: string, noteId: string) {
  const result = await pool.query(`SELECT u.id AS actor_id, vn.id AS note_id, vn.transcript
    FROM users u
    LEFT JOIN voice_notes vn ON vn.id = $2 AND vn.user_id = u.id AND vn.company_id = u.company_id
      AND EXISTS (SELECT 1 FROM projects p WHERE p.id = vn.project_id AND p.company_id = u.company_id)
    WHERE u.id = $1 AND COALESCE(u.is_active, TRUE) = TRUE AND u.company_id IS NOT NULL`, [userId, noteId]);
  if (!result.rowCount) throw new TranscriptEditError(401, 'Not authenticated');
  if (!result.rows[0].note_id) throw new TranscriptEditError(404, 'Voice note not found');
  return { success: true, voiceNoteId: noteId, transcript: result.rows[0].transcript };
}

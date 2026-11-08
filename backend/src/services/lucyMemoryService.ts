import { pool } from '../config/database';
import { CompanyActor } from '../middleware/companyActor';

// Deliberately closed vocabulary: no credentials, arbitrary instructions, or permissions.
export const LUCY_PREFERENCE_OPTIONS = {
  response_style: ['concise', 'conversational', 'formal'],
  detail_level: ['summary', 'balanced', 'detailed'],
  focus_area: ['tasks', 'schedules', 'projects', 'approvals'],
  language: ['en', 'es', 'fr', 'pt'],
  week_start: ['monday', 'sunday'],
  time_format: ['12h', '24h'],
} as const;
export const LUCY_PREFERENCE_LIMIT = 6;
export type LucyPreferenceKey = keyof typeof LUCY_PREFERENCE_OPTIONS;
export class LucyMemoryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const invalid = () => new LucyMemoryError(400, 'Choose a supported preference and value, with an expiry between one hour and 365 days from now.');
function keyOf(key: unknown): LucyPreferenceKey {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(LUCY_PREFERENCE_OPTIONS, key)) throw invalid();
  return key as LucyPreferenceKey;
}
function validate(key: unknown, body: unknown) {
  const name = keyOf(key);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const input = body as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'expiresAt,value' || typeof input.value !== 'string' ||
      !(LUCY_PREFERENCE_OPTIONS[name] as readonly string[]).includes(input.value) ||
      typeof input.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.expiresAt)) throw invalid();
  const expiry = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now() + 3600000 || expiry > Date.now() + 365 * 86400000) throw invalid();
  return { name, value: input.value, expiry: new Date(expiry).toISOString() };
}
const columns = 'preference_key AS key, value, provenance, created_at AS "createdAt", updated_at AS "updatedAt", expires_at AS "expiresAt"';

/** Explicit user choices only. This data is presentation context, NEVER authorization. */
export async function listLucyPreferences(actor: CompanyActor) {
  const result = await pool.query(`SELECT ${columns} FROM lucy_user_preferences
    WHERE company_id=$1 AND user_id=$2 AND expires_at>now() ORDER BY preference_key`, [actor.company_id, actor.id]);
  return result.rows;
}

export async function saveLucyPreference(actor: CompanyActor, key: unknown, body: unknown) {
  const input = validate(key, body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // All mutations for this user serialize on the existing user row, including first insert.
    const owner = await client.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE FOR UPDATE', [actor.id, actor.company_id]);
    if (!owner.rows.length) throw new LucyMemoryError(401, 'Not authenticated');
    await client.query('DELETE FROM lucy_user_preferences WHERE company_id=$1 AND user_id=$2 AND expires_at<=now()', [actor.company_id, actor.id]);
    const current = await client.query('SELECT preference_key FROM lucy_user_preferences WHERE company_id=$1 AND user_id=$2', [actor.company_id, actor.id]);
    if (current.rows.length >= LUCY_PREFERENCE_LIMIT && !current.rows.some(row => row.preference_key === input.name)) {
      throw new LucyMemoryError(409, 'Remove a saved preference before adding another.');
    }
    const result = await client.query(`INSERT INTO lucy_user_preferences(company_id,user_id,preference_key,value,expires_at)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,user_id,preference_key) DO UPDATE
      SET value=EXCLUDED.value, expires_at=EXCLUDED.expires_at,
          updated_at=CASE WHEN lucy_user_preferences.value IS DISTINCT FROM EXCLUDED.value
            OR lucy_user_preferences.expires_at IS DISTINCT FROM EXCLUDED.expires_at THEN now() ELSE lucy_user_preferences.updated_at END
      RETURNING ${columns}`, [actor.company_id, actor.id, input.name, input.value, input.expiry]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function deleteLucyPreference(actor: CompanyActor, key: unknown) {
  const name = keyOf(key);
  await pool.query('DELETE FROM lucy_user_preferences WHERE company_id=$1 AND user_id=$2 AND preference_key=$3', [actor.company_id, actor.id, name]);
}

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { pool } from '../config/database';
export const validEvidenceKey = (key: unknown): key is string => typeof key === 'string' && /^[a-zA-Z0-9_.:-]{16,100}$/.test(key);
export async function evidenceFingerprint(file: string, mime: string, body: Record<string, unknown>) {
 const hash = createHash('sha256');
 for await (const chunk of createReadStream(file)) hash.update(chunk);
 return createHash('sha256').update(JSON.stringify([1, hash.digest('hex'), mime,
 ...['userId','projectId','timeEntryId','template','latitude','longitude','weather','address','altitude','direction'].map(k => body[k] ?? null)])).digest('hex');
}
export async function claimEvidence(scope: string[], fingerprint: string, body: Record<string, unknown>) {
 const inserted = await pool.query(`INSERT INTO evidence_upload_receipts
 (company_id,actor_id,request_key,fingerprint,user_id,project_id,time_entry_id)
 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING request_key`,
 [...scope, fingerprint, body.userId, body.projectId, body.timeEntryId || null]);
 if (inserted.rowCount) return null;
 const result = await pool.query('SELECT fingerprint,state,response FROM evidence_upload_receipts WHERE company_id=$1 AND actor_id=$2 AND request_key=$3', scope);
 if (!result.rowCount) throw new Error('Receipt disappeared');
 return result.rows[0];
}

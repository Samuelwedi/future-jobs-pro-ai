import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { pool } from '../config/database';
export { validEvidenceKey as validVoiceKey } from './evidenceReceipts';

export type VoiceMode = 'audio-only' | 'audio-transcribed' | 'transcript';
export interface VoiceReceiptActor { userId: string; companyId: string }
export interface VoiceReceiptTarget { projectId: string; timeEntryId: string | null; mode: VoiceMode }
export interface VoiceReceiptClaim { actor: VoiceReceiptActor; requestKey: string; target: VoiceReceiptTarget }
interface ReceiptResponse { status: number; body: Record<string, any> }
export class VoiceReceiptError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const scope = ({ actor, requestKey }: VoiceReceiptClaim) => [actor.companyId, actor.userId, requestKey];
const identity = ({ actor, target }: VoiceReceiptClaim) => ({
  companyId: actor.companyId, actorId: actor.userId, ...target,
});

// Hash exact input, not model output. Mode and transport share one key namespace,
// so changing audio-only intent or switching to transcript cannot duplicate a note.
export function voiceFingerprint(content: Buffer | string, target: VoiceReceiptTarget, filename: string | null = null, mime: string | null = null): string {
  return createHash('sha256').update(JSON.stringify([1,
    createHash('sha256').update(content).digest('hex'), filename, mime,
    target.projectId, target.timeEntryId, target.mode,
  ])).digest('hex');
}

async function validateActor(db: PoolClient, actor: VoiceReceiptActor) {
  const live = await db.query(`SELECT id FROM users WHERE id=$1 AND company_id=$2
    AND COALESCE(is_active,TRUE)=TRUE FOR SHARE`, [actor.userId, actor.companyId]);
  if (!live.rowCount) throw new VoiceReceiptError(401, 'Not authenticated');
}
async function validateTarget(db: PoolClient, claim: VoiceReceiptClaim) {
  const { actor, target } = claim;
  const project = await db.query('SELECT id FROM projects WHERE id=$1 AND company_id=$2 FOR SHARE', [target.projectId, actor.companyId]);
  if (!project.rowCount) throw new VoiceReceiptError(404, 'Project not found in your company');
  if (target.timeEntryId) {
    const entry = await db.query('SELECT id FROM time_entries WHERE id=$1 AND user_id=$2 AND project_id=$3 FOR SHARE', [target.timeEntryId, actor.userId, target.projectId]);
    if (!entry.rowCount) throw new VoiceReceiptError(403, 'The selected shift does not belong to this user and project.');
  }
}
async function transaction<T>(action: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await action(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { db.release(); }
}
async function receiptResponse(db: PoolClient, claim: VoiceReceiptClaim, receipt: any): Promise<ReceiptResponse> {
  const current = { ...claim, target: receipt.target };
  await validateTarget(db, current);
  if (receipt.state === 'completed') {
    // Deletion, reassignment, or cross-company moves must never resurrect or
    // disclose the old response, even to the original actor using the same key.
    const note = await db.query(`SELECT id FROM voice_notes WHERE id=$1 AND company_id=$2
      AND user_id=$3 AND project_id=$4 AND time_entry_id IS NOT DISTINCT FROM $5 FOR SHARE`,
    [receipt.response?.voiceNoteId, claim.actor.companyId, claim.actor.userId, current.target.projectId, current.target.timeEntryId]);
    if (!note.rowCount) return { status: 410, body: { success: false, requestKey: claim.requestKey,
      state: 'unavailable', retryAllowed: false, message: 'The completed voice note is no longer available' } };
    return { status: 200, body: receipt.response };
  }
  return { status: 202, body: { success: false, requestKey: claim.requestKey, state: receipt.state,
    receiptIdentity: identity(current), retryAllowed: false,
    message: 'Voice processing is pending or uncertain. Check status; do not submit again.' } };
}

// Commit the durable claim before any upload, model, or adaptive-event service.
// No transaction/row lock is held while waiting on an external provider.
export async function beginVoiceReceipt(claim: VoiceReceiptClaim, fingerprint: string, preflight?: () => void): Promise<ReceiptResponse | null> {
  return transaction(async db => {
    await validateActor(db, claim.actor);
    await validateTarget(db, claim);
    const inserted = await db.query(`INSERT INTO voice_processing_receipts
      (company_id,actor_id,request_key,fingerprint,target) VALUES ($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT DO NOTHING RETURNING request_key`, [...scope(claim), fingerprint, JSON.stringify(claim.target)]);
    if (inserted.rowCount) {
      // Configuration rejection rolls back a new claim, but must never block a
      // completed replay when a provider is temporarily disabled.
      preflight?.();
      return null;
    }
    const existing = await db.query(`SELECT fingerprint,state,response,target FROM voice_processing_receipts
      WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 FOR SHARE`, scope(claim));
    if (!existing.rowCount) throw new Error('Voice receipt unavailable');
    const previous = existing.rows[0];
    if (previous.fingerprint !== fingerprint) return { status: 409, body: {
      success: false, requestKey: claim.requestKey, retryAllowed: false,
      message: 'Voice key was already used for different content, metadata, or processing mode',
    } };
    return receiptResponse(db, claim, previous);
  });
}

export async function completeVoiceReceipt(claim: VoiceReceiptClaim, save: (db: PoolClient) => Promise<Record<string, any>>) {
  return transaction(async db => {
    await validateActor(db, claim.actor);
    await validateTarget(db, claim);
    const receipt = await db.query(`SELECT state FROM voice_processing_receipts
      WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 FOR UPDATE`, scope(claim));
    if (receipt.rows[0]?.state !== 'processing') throw new Error('Voice receipt is no longer processing');
    const result = { ...await save(db), requestKey: claim.requestKey, state: 'completed',
      retryAllowed: false, receiptIdentity: identity(claim) };
    const completed = await db.query(`UPDATE voice_processing_receipts SET state='completed',response=$4::jsonb
      WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 AND state='processing' RETURNING request_key`,
    [...scope(claim), JSON.stringify(result)]);
    if (!completed.rowCount) throw new Error('Voice receipt completion failed');
    return result;
  });
}
export async function markVoiceReceiptUncertain(claim: VoiceReceiptClaim) {
  // A lost COMMIT acknowledgment may mean completion succeeded. Never overwrite it.
  await pool.query(`UPDATE voice_processing_receipts SET state='uncertain'
    WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 AND state='processing'`, scope(claim));
}
export async function readVoiceReceipt(actor: VoiceReceiptActor, requestKey: string): Promise<ReceiptResponse> {
  return transaction(async db => {
    await validateActor(db, actor);
    const receipt = await db.query(`SELECT state,response,target FROM voice_processing_receipts
      WHERE company_id=$1 AND actor_id=$2 AND request_key=$3 FOR SHARE`, [actor.companyId, actor.userId, requestKey]);
    if (!receipt.rowCount) return { status: 404, body: { success: false, requestKey, state: 'missing', retryAllowed: false } };
    return receiptResponse(db, { actor, requestKey, target: receipt.rows[0].target }, receipt.rows[0]);
  });
}

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { pool } from '../config/database';
import type { AttachmentTarget } from './attachmentService';
export { validEvidenceKey as validAttachmentKey } from './evidenceReceipts';
export async function attachmentFingerprint(file: string, name: string, mime: string, target: AttachmentTarget, category: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return createHash('sha256').update(JSON.stringify([1, hash.digest('hex'), name, mime, category,
    ...['shiftId','timeEntryId','projectId','taskId','subjectUserId'].map(key => target[key as keyof AttachmentTarget] || null),
  ])).digest('hex');
}
export async function claimAttachment(scope: string[], fingerprint: string, target: AttachmentTarget) {
  const inserted = await pool.query(`INSERT INTO attachment_upload_receipts
    (company_id,actor_id,request_key,fingerprint,target) VALUES ($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT DO NOTHING RETURNING request_key`, [...scope, fingerprint, JSON.stringify(target)]);
  if (inserted.rowCount) return null;
  const result = await pool.query('SELECT fingerprint,state,response,target FROM attachment_upload_receipts WHERE company_id=$1 AND actor_id=$2 AND request_key=$3', scope);
  if (!result.rowCount) throw new Error('Attachment receipt unavailable');
  return result.rows[0];
}

// ============================================
// ATTACHMENT SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
export type AttachmentTarget = { shiftId?: string; timeEntryId?: string; projectId?: string; taskId?: string; subjectUserId?: string };
export async function saveAttachment(companyId: string, uploadedBy: string, fileName: string, fileUrl: string, fileType: string, fileSize: number, target: AttachmentTarget, category = 'general') {
  const result = await pool.query(
    `INSERT INTO attachments (company_id, uploaded_by, shift_id, time_entry_id, project_id, task_id, subject_user_id, file_name, file_url, file_type, file_size, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [companyId, uploadedBy, target.shiftId || null, target.timeEntryId || null, target.projectId || null, target.taskId || null, target.subjectUserId || null, fileName, fileUrl, fileType, fileSize, category]
  );
  return result.rows[0];
}

export async function listAttachments(companyId: string, target: AttachmentTarget) {
  const pairs: Array<[string, string | undefined]> = [['shift_id', target.shiftId], ['time_entry_id', target.timeEntryId], ['project_id', target.projectId], ['task_id', target.taskId], ['subject_user_id', target.subjectUserId]];
  const selected = pairs.find(([, value]) => value);
  if (!selected) throw new Error('An attachment target is required');
  const result = await pool.query(
    `SELECT a.*, u.first_name || ' ' || u.last_name as uploaded_by_name
     FROM attachments a JOIN users u ON a.uploaded_by = u.id
     WHERE a.company_id = $1 AND a.${selected[0]} = $2 ORDER BY a.created_at DESC`,
    [companyId, selected[1]]
  );
  return result.rows;
}

export async function deleteAttachment(companyId: string, attachmentId: string) {
  const result = await pool.query('DELETE FROM attachments WHERE id = $1 AND company_id = $2 RETURNING id', [attachmentId, companyId]);
  if (!result.rowCount) throw new Error('Attachment not found');
}

console.log('📎 Attachment Service loaded – Future Jobs Pro AI by Samuel B.');

// ============================================
// ATTACHMENT SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';

export async function saveAttachment(
  companyId: string,
  uploadedBy: string,
  fileName: string,
  fileUrl: string,
  fileType: string,
  fileSize: number,
  shiftId?: string,
  timeEntryId?: string,
  projectId?: string
) {
  const result = await pool.query(
    `INSERT INTO attachments (company_id, uploaded_by, shift_id, time_entry_id, project_id, file_name, file_url, file_type, file_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId, uploadedBy, shiftId || null, timeEntryId || null, projectId || null, fileName, fileUrl, fileType, fileSize]
  );
  return result.rows[0];
}

export async function getShiftAttachments(shiftId: string) {
  const result = await pool.query(
    `SELECT a.*, u.first_name || ' ' || u.last_name as uploaded_by_name
     FROM attachments a JOIN users u ON a.uploaded_by = u.id
     WHERE a.shift_id = $1 ORDER BY a.created_at DESC`,
    [shiftId]
  );
  return result.rows;
}

export async function getTimeEntryAttachments(timeEntryId: string) {
  const result = await pool.query(
    `SELECT a.*, u.first_name || ' ' || u.last_name as uploaded_by_name
     FROM attachments a JOIN users u ON a.uploaded_by = u.id
     WHERE a.time_entry_id = $1 ORDER BY a.created_at DESC`,
    [timeEntryId]   // ← corrected variable name
  );
  return result.rows;
}

export async function deleteAttachment(attachmentId: string) {
  await pool.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
}

console.log('📎 Attachment Service loaded – Future Jobs Pro AI by Samuel B.');
import { open } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { AttachmentTarget } from './attachmentService';
import { renderShiftPreviewImage } from './shiftAttachmentPreviewImage';

type Database = Pick<PoolClient, 'query'>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxSource = 5 * 1024 * 1024;
const maxDerivative = 256 * 1024;
const slotsPerTenant = 64; // At most 16 MiB of derivative payloads per tenant in the initial rollout.
let rendering = 0;
const enabled = () => process.env.SHIFT_ATTACHMENT_PREVIEWS_ENABLED === '1';
const actorCanView = `me.id=$1 AND me.company_id=$2 AND COALESCE(me.is_active,TRUE)
  AND (me.role IN ('boss','manager','admin') OR me.id=s.user_id OR EXISTS (
    SELECT 1 FROM shift_assignments x WHERE x.shift_id=s.id AND x.user_id=me.id
  ))`;
const shiftInWorkspace = `FROM users me
  JOIN projects p ON p.company_id=me.company_id AND p.archived_at IS NULL
  JOIN shifts s ON s.project_id=p.id AND s.id=$3`;
const attachmentInShift = `a.shift_id=s.id AND a.company_id=p.company_id
   AND a.time_entry_id IS NULL AND a.project_id IS NULL
   AND a.task_id IS NULL AND a.subject_user_id IS NULL`;
const valid = (...ids:string[]) => ids.every(id=>typeof id==='string' && uuid.test(id));

export async function prepareShiftAttachmentPreview(
  db: Database, actorId: string, companyId: string, target: AttachmentTarget,
  file: {path:string;mimetype:string;size:number}, fileName: string,
): Promise<Buffer | null> {
  if (!enabled() || !target.shiftId || !valid(actorId,companyId,target.shiftId)
      || target.timeEntryId || target.projectId || target.taskId || target.subjectUserId
      || !Number.isSafeInteger(file.size) || file.size<1 || file.size>maxSource
      || !(file.mimetype==='image/jpeg' && /\.jpe?g$/i.test(fileName)
        || file.mimetype==='image/png' && /\.png$/i.test(fileName))
      || rendering>=2) return null;
  rendering++;
  try {
    const scope = [actorId,companyId,target.shiftId];
    if (!(await db.query(`SELECT s.id ${shiftInWorkspace} WHERE ${actorCanView}`,scope)).rowCount) return null;
    const fileHandle = await open(file.path,'r');
    let source:Buffer;
    try {
      const stat = await fileHandle.stat();
      if (!stat.isFile() || stat.size!==file.size) return null;
      source=Buffer.alloc(file.size);
      // Use the admitted Multer file only. Never open an attachment URL.
      let read=0;
      while(read<source.length){
        const {bytesRead}=await fileHandle.read(source,read,source.length-read,read);
        if (!bytesRead) return null;
        read+=bytesRead;
      }
      const extra=Buffer.alloc(1);
      if((await fileHandle.read(extra,0,1,read)).bytesRead) return null;
    } finally { await fileHandle.close(); }
    const jpeg = await renderShiftPreviewImage(source,file.mimetype,file.size);
    return jpeg && jpeg.length<=maxDerivative ? jpeg : null;
  } catch { return null; } finally { rendering--; }
}

/** Use only inside the attachment transaction, after the original row has been inserted. */
export async function writeShiftAttachmentPreview(
  db: Database, actor: string, company: string, shift: string, attachment: string, jpeg: Buffer,
) {
  if (!enabled() || !valid(actor,company,shift,attachment) || jpeg.length>maxDerivative) return;
  // Bound tenant storage under concurrent writers. Each calls this statement
  // before counting rows, so the next READ COMMITTED snapshot sees the last commit.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('shift-preview:' || $1::text, 0))",[company]);
  await db.query(
    `INSERT INTO shift_attachment_previews(attachment_id,company_id,shift_id,jpeg)
     SELECT a.id,a.company_id,s.id,$5::bytea
     ${shiftInWorkspace} JOIN attachments a ON ${attachmentInShift} AND a.id=$4
     WHERE ${actorCanView}
       AND (SELECT count(*) FROM shift_attachment_previews WHERE company_id=$2)<$6
     ON CONFLICT (attachment_id) DO NOTHING`,
    [actor,company,shift,attachment,jpeg,slotsPerTenant],
  );
}

export async function readStoredShiftAttachmentPreview(
  db: Database, actor: string, company: string, shift: string, attachment: string, signal: AbortSignal,
) {
  if (!enabled() || !valid(actor,company,shift,attachment) || signal.aborted) return null;
  // Binding, authorization and bytes come from one statement. No asynchronous
  // provider read or URL resolution after the authorization snapshot.
  const result=await db.query(
    `SELECT preview.jpeg ${shiftInWorkspace}
     JOIN attachments a ON ${attachmentInShift} AND a.id=$4
     JOIN shift_attachment_previews preview ON preview.attachment_id=a.id
       AND preview.shift_id=s.id AND preview.company_id=a.company_id
     WHERE ${actorCanView}`,[actor,company,shift,attachment],
  );
  const bytes:unknown=result.rows[0]?.jpeg;
  return !signal.aborted && bytes instanceof Uint8Array && bytes.byteLength<=maxDerivative
    ? Buffer.from(bytes) : null;
}

export async function listScopedShiftAttachments(
  db:Database,actor:string,company:string,shift:string,
):Promise<Array<{id:string;file_name:string;file_type:string;file_url:string;preview_available:boolean}>> {
  if (!valid(actor,company,shift)) return [];
  const previewAvailable = enabled() ? `EXISTS (
    SELECT 1 FROM shift_attachment_previews preview WHERE preview.attachment_id=a.id
      AND preview.shift_id=s.id AND preview.company_id=a.company_id
  )` : 'FALSE';
  const result=await db.query(
    `SELECT a.id,a.file_name,a.file_type,a.file_url,${previewAvailable} AS preview_available
     ${shiftInWorkspace} JOIN attachments a ON ${attachmentInShift}
     WHERE ${actorCanView} ORDER BY a.created_at DESC,a.id LIMIT 100`,[actor,company,shift],
  );
  return result.rows;
}

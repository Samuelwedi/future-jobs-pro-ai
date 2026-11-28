import { createHash } from 'node:crypto';
import { zip, type ZipEntry } from './evidenceZip';

export const MAX_PROJECT_EXPORT_PHOTOS = 25;
const MAX_BYTES = 32 * 1024 * 1024;
const formats: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif',
};

type Original = {
  id: string; source_project_id: string; source_project_name: string;
  user_id: string | null; taken_at: Date | string | null; verification_hash: string | null;
  copied_at: Date | string | null; copied_by: string | null; s3_key: string;
};
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function buildProjectPhotoExport(project: {id:string;name:string}, selected: Original[]) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud || !/^[a-zA-Z0-9_-]+$/.test(cloud)) throw new Error('Evidence storage unavailable');
  const entries: ZipEntry[] = [];
  const records = [];
  let remaining = MAX_BYTES;
  const signal = AbortSignal.timeout(25000);
  for (const row of selected) {
    const url = new URL(row.s3_key);
    const prefix = '/' + cloud + '/image/upload/';
    // Only the configured Cloudinary account, original versioned workspace image, no transformations or redirects.
    const objectPath = url.pathname.slice(prefix.length);
    if (url.origin !== 'https://res.cloudinary.com' || url.username || url.password ||
        url.search || url.hash || !url.pathname.startsWith(prefix) ||
        !/^v\d+\/future-jobs-pro-ai\/projects\/[0-9a-f-]{36}\/\d{4}-(0[1-9]|1[0-2])\/photos\/[a-zA-Z0-9_.-]+$/i.test(objectPath) || objectPath.split('/')[3] !== row.source_project_id) {
      throw new Error('Original photo unavailable from configured storage');
    }
    const response = await fetch(url, { redirect: 'error', signal });
    const format = formats[(response.headers.get('content-type') || '').split(';')[0].toLowerCase()];
    const max = Math.min(remaining, 12 * 1024 * 1024);
    if (!response.ok || !format || !response.body || Number(response.headers.get('content-length')) > max) {
      await response.body?.cancel();
      throw new Error('Original photo could not be downloaded within the export limit');
    }
    const reader = response.body.getReader();
    const parts: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) throw new Error('Project photo export exceeds its limit');
        parts.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (!size) throw new Error('Original photo is empty');
    remaining -= size;
    const binary = Buffer.concat(parts, size);
    const name = `photos/${row.id}${format}`;
    entries.push({name, data:binary});
    records.push({
      id: row.id, file: name, size, artifactSha256: sha(binary),
      originalCapture: {
        projectId: row.source_project_id, projectName: row.source_project_name,
        actorId: row.user_id, capturedAt: row.taken_at, storedVerificationHash: row.verification_hash,
      },
      filedReference: row.copied_at ? {actorId:row.copied_by, filedAt:row.copied_at} : null,
    });
  }
  entries.push({name:'manifest.json', data:Buffer.from(JSON.stringify({
    schemaVersion:1, project,
    note:'Original capture metadata and later filing are separate. Artifact checksums describe the included bytes, not independent verification of field events.',
    photos:records,
  }, null, 2))});
  return zip(entries);
}

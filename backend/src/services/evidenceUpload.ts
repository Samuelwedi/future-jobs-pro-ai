import fs from 'fs';
import { pipeline, Writable } from 'stream';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

/** Chunk video bytes from disk; do not create a second full-file memory copy or use the small-upload API. */
export async function uploadEvidenceFile(file: string, folder: string, video: boolean): Promise<UploadApiResponse> {
  const result = video ? await new Promise<UploadApiResponse>((resolve, reject) => {
    let source: fs.ReadStream | undefined;
    let output: Writable | undefined;
    let settled = false;
    const finish = (error?: unknown, response?: UploadApiResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {source?.destroy(); output?.destroy(); reject(error);}
      else if (response) resolve(response);
      else reject(new Error('Upload did not return evidence metadata'));
    };
    const timer = setTimeout(() => finish(new Error('Video upload timed out; check saved evidence before retrying')), 15*60*1000);
    timer.unref();
    try {
      output = cloudinary.uploader.upload_chunked_stream({folder, resource_type:'video', chunk_size:6*1024*1024, timeout:120000}, (error, response) => {
        if (!error && response?.done === false) return;
        finish(error, response);
      });
      source = fs.createReadStream(file);
      pipeline(source, output, error => {if (error) finish(error);});
    } catch (error) {finish(error);}
  }) : await cloudinary.uploader.upload(file, {folder, resource_type:'image', timeout:120000});
  if (!result?.secure_url || !/^https:\/\//.test(result.secure_url)) throw new Error('Upload did not return a secure evidence URL');
  return result;
}

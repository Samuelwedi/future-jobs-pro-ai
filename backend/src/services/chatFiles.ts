import path from 'node:path';

export const CHAT_FILE_LIMIT = 25 * 1024 * 1024;
const types: Record<string,string> = {
 '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp',
 '.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm',
 '.pdf':'application/pdf','.doc':'application/msword',
 '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 '.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 '.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 '.txt':'text/plain','.csv':'text/csv','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav',
};
export function chatFileType(name:string, bytes:Buffer):string {
 const type=types[path.extname(name).toLowerCase()];
 if(!type)throw new Error('Use a photo, video, audio, PDF, Office document, text or CSV file');
 if(!bytes.length||bytes.length>CHAT_FILE_LIMIT)throw new Error('Files must be between 1 byte and 25 MB');
 const head=bytes.subarray(0,16);
 if(type==='application/pdf'&&!head.toString().startsWith('%PDF-'))throw new Error('Invalid PDF file');
 if(type==='image/png'&&!head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG file');
 if(type==='image/jpeg'&&!(head[0]===255&&head[1]===216&&head[2]===255))throw new Error('Invalid JPEG file');
 if(type==='image/webp'&&!(head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP'))throw new Error('Invalid WebP file');
 if(/\.(docx|xlsx|pptx)$/i.test(name)&&head.toString('ascii',0,2)!=='PK')throw new Error('Invalid Office document');
 return type;
}
export function safeFilename(name:string):string {
 return path.basename(name.replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f"<>]/g,'_').slice(0,180)||'attachment';
}

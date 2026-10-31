export function uploadMetadata(uri: string, field: string, info?: {name:string;mimeType?:string}) {
 const name = info?.name || uri.split('/').pop()?.split('?')[0] || (field==='audio'?'recording.m4a':'capture.jpg');
 const ext = name.split('.').pop()?.toLowerCase();
 const types:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',mp4:'video/mp4',mov:'video/quicktime',m4v:'video/x-m4v',m4a:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav',caf:'audio/x-caf',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',csv:'text/csv'};
 return {name,type:info?.mimeType || (field==='audio'&&ext==='mp4'?'audio/mp4':types[ext||'']||'application/octet-stream')};
}

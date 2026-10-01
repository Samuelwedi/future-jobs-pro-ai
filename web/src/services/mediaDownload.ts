export async function downloadMedia(item:{id:string;type:string;url:string}):Promise<void>{
  if(!item.url || item.url==='null')throw new Error('This recording has no downloadable file.');
  const source=new URL(item.url,window.location.origin);
  if(source.username || source.password || (source.origin!==window.location.origin &&
      (source.protocol!=='https:' || source.hostname!=='res.cloudinary.com')))
    throw new Error('This file uses an unsupported storage address. Contact your company administrator.');
  // Never forward workspace credentials or JWTs to cloud storage.
  const response=await fetch(source.href,{credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error(`Download failed (HTTP ${response.status}). The file may no longer be available.`);
  const blob=await response.blob();
  if(!blob.size)throw new Error('The file is empty.');
  const mime=blob.type.split(';')[0].toLowerCase();
  const expected=item.type==='photo'?'image/':item.type==='video'?'video/':'audio/';
  if(!mime.startsWith(expected) && !(item.type==='voice_note' && mime==='video/mp4') && mime!=='application/octet-stream')
    throw new Error('The server did not return the expected media file.');
  const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/heic':'heic','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/mpeg':'mp3','audio/mp4':'m4a','audio/aac':'aac','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/webm':'webm'};
  const pathExtension=source.pathname.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1];
  const extension=extensions[mime] || (mime==='application/octet-stream'?'bin':pathExtension||'bin');
  const filename=`${item.type}-${item.id}`.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)+'.'+extension;
  const url=URL.createObjectURL(blob);const link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);
  try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);}
}

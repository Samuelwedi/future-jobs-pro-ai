export async function downloadMedia(item:{id:string;type:string;url:string},current:()=>boolean=()=>true):Promise<void>{
  const assertCurrent=()=>{if(!current())throw new Error('The media view changed. No file was saved.');};
  assertCurrent();
  if(!item.url || item.url==='null')throw new Error('This recording has no downloadable file.');
  const source=new URL(item.url,window.location.origin);
  if(source.username || source.password || (source.origin!==window.location.origin &&
      (source.protocol!=='https:' || source.hostname!=='res.cloudinary.com')))
    throw new Error('This file uses an unsupported storage address. Contact your company administrator.');
  // Never forward workspace credentials or JWTs to cloud storage.
  const response=await fetch(source.href,{credentials:'omit',referrerPolicy:'no-referrer'});
  assertCurrent();
  if(!response.ok)throw new Error(`Download failed (HTTP ${response.status}). The file may no longer be available.`);
  const blob=await response.blob();
  assertCurrent();
  if(!blob.size)throw new Error('The file is empty.');
  const mime=blob.type.split(';')[0].toLowerCase();
  const expected=item.type==='photo'?'image/':item.type==='video'?'video/':'audio/';
  if(!mime.startsWith(expected) && !(item.type==='voice_note' && mime==='video/mp4') && mime!=='application/octet-stream')
    throw new Error('The server did not return the expected media file.');
  const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/heic':'heic','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/mpeg':'mp3','audio/mp4':'m4a','audio/aac':'aac','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/webm':'webm'};
  const pathExtension=source.pathname.match(/\.([a-zA-Z0-9]{1,5})$/)?.[1];
  const extension=extensions[mime] || (mime==='application/octet-stream'?'bin':pathExtension||'bin');
  const filename=`${item.type}-${item.id}`.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)+'.'+extension;
  assertCurrent();
  const url=URL.createObjectURL(blob);
  let link:HTMLAnchorElement|undefined, clicked=false;
  try {
    assertCurrent();
    link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);
    assertCurrent();link.click();clicked=true;
  } finally {
    try { link?.remove(); } finally {
      if(clicked)window.setTimeout(()=>URL.revokeObjectURL(url),60000);
      else URL.revokeObjectURL(url);
    }
  }
}

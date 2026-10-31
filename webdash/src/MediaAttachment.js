import React,{useEffect,useState} from 'react';
export default function MediaAttachment(PROPS){
 const {name,mime,load}=PROPS;
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 const open=async()=>{setBusy(true);setError('');try{const blob=await load();if(/text\/html|application\/json/.test(blob.type))throw Error('The server did not return a media file');setUrl(URL.createObjectURL(blob));}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <div><button type="button" onClick={()=>void open()} disabled={busy}>{busy?'Loading…':`View ${name}`}</button>{error&&<p role="alert">{error}</p>}{url&&<div role="dialog" aria-modal="true" aria-label={name} style={{position:'fixed',inset:0,zIndex:2000,background:'#07111fee',color:'white',padding:24,overflow:'auto',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}><button autoFocus type="button" onClick={()=>setUrl('')}>Close viewer</button><strong>{name}</strong>{mime.startsWith('image/')?<img src={url} alt={name} style={{maxWidth:'100%',maxHeight:'70vh',objectFit:'contain'}}/>:mime.startsWith('video/')?<video src={url} controls playsInline style={{maxWidth:'100%',maxHeight:'70vh'}}/>:mime.startsWith('audio/')?<audio src={url} controls/>:<p>Download this document to open it in a compatible app.</p>}<a href={url} download={name} style={{color:'#67E8F9'}}>Save {name}</a></div>}</div>;
}

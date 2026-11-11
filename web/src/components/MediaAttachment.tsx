import React, { useEffect, useRef, useState } from 'react';
export default function MediaAttachment(PROPS: { name: string; mime: string; load: () => Promise<Blob>; isCurrent?: () => boolean }) {
  const { name, mime, load, isCurrent } = PROPS;
  const mounted = useRef(true), lock = useRef(false), currentGuard = useRef(isCurrent);
  currentGuard.current = isCurrent;
  const urlRef = useRef('');
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const close = () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = ''; setUrl(''); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = ''; }; }, []);
  const open = async () => {
    const guard = currentGuard.current;
    const current = () => mounted.current && guard === currentGuard.current && (!guard || guard());
    if (lock.current || !current()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const blob = await load();
      if (!current()) return;
      if (/text\/html|application\/json/.test(blob.type)) throw Error('The server did not return a media file');
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setUrl(urlRef.current);
    } catch (cause: any) { if (current()) setError(cause.message); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  return <div><button type="button" onClick={() => void open()} disabled={busy}>{busy ? 'Loading…' : `View ${name}`}</button>{error && <p role="alert">{error}</p>}{url && (!isCurrent || isCurrent()) && <div role="dialog" aria-modal="true" aria-label={name} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#07111fee', color: 'white', padding: 24, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><button autoFocus type="button" onClick={close}>Close viewer</button><strong>{name}</strong>{mime.startsWith('image/') ? <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} /> : mime.startsWith('video/') ? <video src={url} controls playsInline style={{ maxWidth: '100%', maxHeight: '70vh' }} /> : mime.startsWith('audio/') ? <audio src={url} controls /> : <p>Download this document to open it in a compatible app.</p>}<a href={url} download={name} onClick={event => { if (isCurrent && !isCurrent()) event.preventDefault(); }} style={{ color: '#67E8F9' }}>Save {name}</a></div>}</div>;
}

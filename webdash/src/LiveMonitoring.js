import React, { useCallback, useEffect, useRef, useState } from 'react';

const time = value => value ? new Date(value).toLocaleString() : '—';
const jobLabel = { queued: 'Queued', running: 'Investigating', review: 'Recommendation ready', accepted: 'Recommendation accepted', dismissed: 'Dismissed', failed: 'Review failed', cancelled: 'Cancelled' };

export default function LiveMonitoring({ client, isOwner, onUnauthorized }) {
  const [incidents, setIncidents] = useState([]);
  const [ops, setOps] = useState(null);
  const [error, setError] = useState('');
  const [opsError, setOpsError] = useState('');
  const [updated, setUpdated] = useState(null);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [diagnostics, setDiagnostics] = useState(null);
  const [verify, setVerify] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const mounted = useRef(false);
  const controller = useRef(null);
  const actionLock = useRef(false);

  const refresh = useCallback(async () => {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    const api = client();
    const results = await Promise.allSettled([
      api.get('/api/system-reliability/incidents?status=all', { signal: abort.signal, timeout: 12000 }),
      ...(isOwner ? [api.get('/api/owner-operations', { signal: abort.signal, timeout: 12000 })] : []),
    ]);
    if (controller.current !== abort) return;
    controller.current = null;
    if (!mounted.current || abort.signal.aborted) return;
    if (results.some(r => r.status === 'rejected' && r.reason?.response?.status === 401)) { onUnauthorized(); return; }
    if (results[0].status === 'fulfilled') {
      setIncidents(results[0].value.data.incidents || []); setUpdated(new Date()); setError('');
    } else setError('Live error feed unavailable. Displaying the last received data; retrying automatically while live updates are enabled.');
    if (isOwner) {
      if (results[1].status === 'fulfilled') { setOps(results[1].value.data); setOpsError(''); }
      else setOpsError('IT review feed unavailable. Previously received reviews may be out of date.');
    }
  }, [client, isOwner, onUnauthorized]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => { if (!paused && document.visibilityState === 'visible') void refresh(); }, 5000);
    const visible = () => { if (!paused && document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); controller.current?.abort(); controller.current = null; };
  }, [refresh, paused]);

  const action = async (fn, message) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true); setNotice('');
    try { await fn(); if (mounted.current) { setNotice(message); await refresh(); } }
    catch (e) { if (e.response?.status === 401) onUnauthorized(); else if (mounted.current) setNotice(e.response?.data?.message || 'Action failed. Please retry.'); }
    finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  };
  const repairs = ops?.repairs || [];
  const repairLabel = { queued:'Queued', dispatching:'Starting checks', running:'Generating, testing and deploying', deployed:'Deployed — verify affected workflow', awaiting_store:'Code prepared — native build and device testing required', failed:'Repair failed — inspect workflow', blocked:'Repair blocked' };
  const active = incidents.filter(i => i.status !== 'resolved');
  const jobs = (ops?.jobs || []).filter(j => j.department === 'it');
  const shown = incidents.filter(i => (filter === 'all' || (filter === 'active' ? i.status !== 'resolved' : i.status === filter)) && `${i.component} ${i.summary} ${i.severity}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="management-panel live-monitor">
    <header className="monitor-header"><div><span className="eyebrow">Platform observability</span><h1>Live errors & fix monitoring</h1><p role="status"><span className={`feed-dot ${error || paused ? 'feed-warning' : ''}`} />{paused ? 'Updates paused' : error ? 'Connection interrupted' : updated ? 'Live · refreshes every 5 seconds' : 'Connecting…'} · Last received: {time(updated)}</p></div><div className="header-actions"><button className="secondary-button" onClick={() => setPaused(p => !p)}>{paused ? 'Resume live updates' : 'Pause updates'}</button><button className="secondary-button" onClick={refresh}>Refresh now</button></div></header>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {notice && <p role="status" className="lucy-summary">{notice}</p>}
    <div className="monitor-metrics">{[['Active incidents', active.length], ['Critical active', active.filter(i => i.severity === 'critical').length], ['Under investigation', active.filter(i => i.status === 'acknowledged').length], ['Resolved incidents', incidents.filter(i => i.status === 'resolved').length]].map(([label, count]) => <article key={label}><span>{label}</span><strong>{updated ? count : '—'}</strong></article>)}</div>
    <p>Counts cover up to 250 recorded incidents. New occurrences update automatically. Resolved status is a staff confirmation, not proof of an automated repair.</p>
    <div className="monitor-filters"><label>Status<select value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Active</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="all">All</option></select></label><label>Search errors<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Component, message or severity" /></label></div>
    <h2>Error feed</h2>
    {!shown.length && <p>{updated ? 'No matching incidents in the received data.' : 'Loading incidents…'}</p>}
    {shown.map(i => <article className="monitor-incident" key={i.id}><div className="monitor-header"><strong>{i.component}</strong><span className={`incident-badge severity-${i.severity}`}>{i.severity} · {i.status}</span></div><h3>{i.summary}</h3><p>{i.occurrences} occurrences · First seen: {time(i.firstSeenAt)} · Last seen: {time(i.lastSeenAt)}</p>{i.details?.context && <details><summary>Device and error details</summary><p>Platform: {i.details.context.platform || 'Unknown'} · App: {i.details.context.appVersion || 'Unknown'} · Build: {i.details.context.buildVersion || 'Unknown'} · OS: {i.details.context.osVersion || 'Unknown'}</p><pre className="ops-result">{i.details.context.errorStack || i.details.context.componentStack || 'No stack recorded.'}</pre></details>}<div className="monitor-actions">
      {i.status === 'open' && <button className="secondary-button" disabled={busy} onClick={() => action(() => client().patch(`/api/system-reliability/incidents/${i.id}`, { status: 'acknowledged' }), 'Incident acknowledged.')}>Acknowledge</button>}
      {i.status !== 'resolved' && <button className="resolve-button" disabled={busy} onClick={() => { setVerify(i); setConfirmed(false); }}>Verify resolution</button>}
      {isOwner && i.status !== 'resolved' && <button className="secondary-button" disabled={busy || !ops?.workerEnabled || !ops?.apiConfigured || jobs.some(j => ['queued','running'].includes(j.status) && (j.incident_id === i.id || j.instruction?.includes(`Incident ${i.id}:`)))} onClick={() => action(() => client().post('/api/owner-operations/jobs', { department: 'it', incidentId: i.id, instruction: `Incident ${i.id}: ${i.component} — ${i.summary}. Analyze current diagnostics and propose a fix with acceptance checks. Do not deploy changes or mark this incident resolved.` }), 'IT investigation queued. Track its progress below.')}>Request IT investigation</button>}
      {isOwner && i.status !== 'resolved' && <button className="secondary-button" disabled={busy || !ops?.repairEnabled || repairs.some(r => r.incident_id === i.id && ['queued','dispatching','running'].includes(r.status))} onClick={() => action(() => client().post('/api/owner-operations/repairs', { incidentId:i.id }), 'Lucy repair queued. Tests must pass before web deployment. Native releases still require device testing and human store submission.')}>Fix with Lucy</button>}
    </div>{verify?.id === i.id && <div className="monitor-verification"><p>Confirm only after testing the affected workflow and checking that the error no longer occurs.</p><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I verified the affected workflow after the fix.</label><button className="resolve-button" disabled={!confirmed || busy} onClick={() => action(async () => { await client().patch(`/api/system-reliability/incidents/${i.id}`, { status: 'resolved' }); setVerify(null); }, 'Resolution recorded. Any recurrence will appear as a new incident.')}>Mark resolved</button> <button className="secondary-button" onClick={() => setVerify(null)}>Cancel</button></div>}</article>)}
    <section className="monitor-diagnostics"><h2>Live service diagnostics</h2><p>Run a fresh database and runtime check. Readings below are a point-in-time snapshot.</p><button className="secondary-button" disabled={busy} onClick={() => action(async () => { const r = await client().post('/api/system-reliability/diagnostics', {}, { timeout: 15000 }); setDiagnostics({ ...r.data, receivedAt: new Date() }); }, 'Diagnostics received.')}>Run diagnostics</button>{diagnostics && <><p>Database: <strong>{diagnostics.status}</strong> · Received: {time(diagnostics.receivedAt)}</p><div className="monitor-metrics"><article><span>Memory RSS</span><strong>{diagnostics.metrics?.runtime?.memoryMb?.rss ?? '—'} MB</strong></article><article><span>Event loop p99</span><strong>{diagnostics.metrics?.runtime?.eventLoopDelayMs?.p99 ?? '—'} ms</strong></article><article><span>Database waiters</span><strong>{diagnostics.metrics?.databasePool?.waiting ?? '—'}</strong></article><article><span>Lucy failures / requests</span><strong>{diagnostics.metrics?.runtime?.lucy?.failures ?? '—'} / {diagnostics.metrics?.runtime?.lucy?.requests ?? '—'}</strong></article></div></>}</section>
    {isOwner && <section><h2>Lucy repair execution</h2><p>{ops?.repairEnabled ? 'Enabled across backend, customer web, support portal and mobile source. Two repair attempts per day.' : 'Not activated. The isolated repair worker needs credentials and an end-to-end acceptance check.'}</p><p>All repairs must pass backend, web, portal and mobile checks. Backend, cross-application and sensitive changes produce review candidates requiring owner approval. Eligible web fixes deploy automatically. Native fixes need a new build, device verification and human store submission. A successful job never marks an incident resolved automatically.</p>{repairs.map(r => <article className="monitor-incident" key={r.id}><strong>{r.status === 'blocked' && r.error?.startsWith('Owner approval required:') ? 'Tested repair — owner review required' : (repairLabel[r.status] || r.status)}</strong><p>{r.scope} · Requested: {time(r.created_at)} · Finished: {time(r.completed_at)}</p>{r.error && <p role="alert">{r.error}</p>}{/^https:\/\/github\.com\/Samuelwedi\/future-jobs-pro-ai\/actions\/runs\/\d+$/.test(r.workflow_url || '') && <a href={r.workflow_url} target="_blank" rel="noreferrer">View checks and deployment</a>}</article>)}</section>}
    {isOwner && <section><h2>IT investigation & fix review activity</h2><p>Tracks your latest IT reviews, from queued to recommendations. Accepted recommendations do not execute code or deploy fixes.</p>{opsError && <p role="alert" className="error-banner">{opsError}</p>}<p>Worker: {ops ? ops.workerEnabled ? 'Enabled' : 'Disabled' : 'Unknown'} · AI configuration: {ops ? ops.apiConfigured ? 'Present' : 'Missing' : 'Unknown'}</p>{!jobs.length && <p>No IT reviews in the latest 100 operation jobs.</p>}{jobs.map(j => <article className="monitor-incident" key={j.id}><div className="monitor-header"><strong>{jobLabel[j.status] || j.status}</strong><span>{time(j.created_at)}</span></div><p>{j.instruction}</p><p>Started: {time(j.started_at)} · Finished: {time(j.completed_at)}</p>{j.error && <p className="error-banner">{j.error}</p>}{j.result && <details><summary>Read diagnosis and proposed fix</summary><pre className="ops-result">{j.result}</pre></details>}</article>)}</section>}
  </section>;
}

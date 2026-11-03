import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { api } from '../services/api';
const freshKey = () => crypto.randomUUID();
export default function CommercialEmail({ kind, id, onChange }: {
    kind: 'invoice' | 'estimate';
    id: string;
    onChange: () => Promise<void>;
}) {
    const [data, setData] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const lock = useRef(false), key = useRef(freshKey()), refreshParent = useRef(onChange);
    refreshParent.current = onChange;
    const endpoint = `/api/${kind === 'invoice' ? 'invoices' : 'estimates'}/${id}/email`;
    const refresh = async () => { setData(await api.get(endpoint)); };
    useEffect(() => { let active = true, polling = false, previous = ''; setData(null); key.current = freshKey(); const poll = async () => { if (polling)
        return; polling = true; try {
        const result = await api.get<any>(endpoint);
        if (!active)
            return;
        setData(result);
        const status = result.jobs[0]?.status || '';
        if (previous && previous !== status && status === 'sent')
            void refreshParent.current().catch(() => { });
        previous = status;
    }
    catch (cause: any) {
        if (active)
            setError(cause.message);
    }
    finally {
        polling = false;
    } }; void poll(); const timer = setInterval(() => void poll(), 5000); return () => { active = false; clearInterval(timer); }; }, [endpoint]);
    const run = async (work: () => Promise<void>) => { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); try {
        await work();
    }
    catch (cause: any) {
        setError(cause.message);
    }
    finally {
        lock.current = false;
        setBusy(false);
    } };
    const job = data?.jobs?.[0], pending = ['queued', 'sending', 'uncertain'].includes(job?.status);
    const send = () => { if (!window.confirm(`${job?.status === 'sent' ? 'Send this PDF again' : 'Email this PDF'} to ${data.recipient}?`))
        return; void run(async () => { if (job && ['sent', 'failed', 'cancelled'].includes(job.status))
        key.current = freshKey(); const result = await api.post<any>(endpoint, { confirmed: true, requestKey: key.current, recipient: data.recipient, fingerprint: data.fingerprint }); setData((current: any) => ({ ...current, jobs: [result.job, ...(current.jobs || []).filter((row: any) => row.id !== result.job.id)] })); await refresh(); }); };
    const change = (body: any) => { if (!window.confirm('Confirm this email action? Verify uncertain delivery with your email provider before resolving it.'))
        return; void run(async () => { await api.post(`${endpoint}/${job.id}`, { ...body, confirmed: true }); await refresh(); await refreshParent.current(); }); };
    return <Stack spacing={2} sx={{ py: 2 }}><Typography variant="h6">Email delivery</Typography>{error && <Alert severity="error">{error}</Alert>}<Typography>{data?.configured ? 'PDF email is available.' : 'Email is unavailable until SMTP is configured.'}</Typography><Typography>Recipient: {data?.recipient || 'No client email'}</Typography>{job && <Typography>Latest email: {job.status === 'sent' ? 'Accepted by email server' : job.status}</Typography>}<Button disabled={busy || !data?.configured || !data?.eligible || !data?.recipient || pending} onClick={send}>{job?.status === 'sent' ? 'Send PDF again' : 'Email PDF to client'}</Button>{job?.status === 'queued' && <Button disabled={busy} onClick={() => change({ action: 'cancel' })}>Cancel queued email</Button>}{job?.status === 'uncertain' && <><Alert severity="warning">Delivery is uncertain. Automatic resend is paused to avoid duplicates.</Alert><Button disabled={busy} onClick={() => change({ action: 'resolve', delivered: true })}>Confirm email was sent</Button><Button disabled={busy} onClick={() => change({ action: 'resolve', delivered: false })}>Confirm email was not sent</Button></>}</Stack>;
}

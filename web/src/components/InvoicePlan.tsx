import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../services/api';
export default function InvoicePlan({ id, onCreated }: {
    id: string;
    onCreated: (invoice: any) => void;
}) {
    const [plan, setPlan] = useState<any>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [enabled, setEnabled] = useState(false), [frequency, setFrequency] = useState('monthly'), [end, setEnd] = useState('');
    const lock = useRef(false);
    const load = async () => { const result = await api.get<any>(`/api/invoices/${id}/billing-plan`); setPlan(result); setEnabled(!!result.isRecurring); setFrequency(result.frequency || 'monthly'); setEnd(String(result.endDate || '').slice(0, 10)); };
    useEffect(() => { let active = true; setPlan(null); void api.get<any>(`/api/invoices/${id}/billing-plan`).then(result => { if (active) {
        setPlan(result);
        setEnabled(!!result.isRecurring);
        setFrequency(result.frequency || 'monthly');
        setEnd(String(result.endDate || '').slice(0, 10));
    } }).catch(cause => { if (active)
        setError(cause.message); }); return () => { active = false; }; }, [id]);
    const run = async (work: () => Promise<void>) => { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); setNotice(''); try {
        await work();
    }
    catch (cause: any) {
        setError(cause.message);
    }
    finally {
        lock.current = false;
        setBusy(false);
    } };
    return <Stack spacing={2} sx={{ py: 2 }}><Typography variant="h6">Billing plan</Typography>{error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="info">{notice}</Alert>}
 {plan && !plan.generatedFromId && !plan.parentId && !plan.milestones.length && plan.status === 'draft' && <><Button disabled={busy} variant={enabled ? 'contained' : 'outlined'} onClick={() => setEnabled(value => !value)}>Recurring schedule: {enabled ? 'on' : 'off'}</Button>{enabled && <><TextField select label="Frequency" value={frequency} disabled={busy} onChange={event => setFrequency(event.target.value)}>{['weekly', 'monthly', 'quarterly'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField type="date" label="Recurring end date (optional)" InputLabelProps={{ shrink: true }} value={end} disabled={busy} onChange={event => setEnd(event.target.value)}/></>}<Button disabled={busy} onClick={() => { if (window.confirm('Save this schedule? Due occurrences create drafts only, without emailing or charging.'))
        void run(async () => { await api.put(`/api/invoices/${id}/billing-plan`, { isRecurring: enabled, recurringFrequency: frequency, recurringEndDate: end || null }); await load(); }); }}>Save recurring schedule</Button></>}
 {!!plan?.isRecurring && <><Typography>Next draft: {plan.nextDate} · {plan.enabled ? 'Enabled' : 'Paused'}</Typography><Alert severity="info">Due occurrences create draft invoices for review. They do not send email or charge customers.</Alert>{plan.status !== 'draft' && <><Button disabled={busy} onClick={() => { if (window.confirm('Change future draft generation?'))
        void run(async () => { await api.put(`/api/invoices/${id}/billing-plan`, { enabled: !plan.enabled }); await load(); }); }}>{plan.enabled ? 'Pause' : 'Resume'} recurring schedule</Button><Button disabled={busy || !plan.enabled || plan.ended || plan.nextDate > plan.today} onClick={() => { if (window.confirm(`Create the recurring draft dated ${plan.nextDate}?`))
        void run(async () => { const result = await api.post<any>(`/api/invoices/${id}/recurring-next`, { index: plan.index, confirmed: true }); await load(); if (result.invoice)
            onCreated(result.invoice);
        else
            setNotice(result.ended ? 'Schedule ended.' : 'The next occurrence is not due yet.'); }); }}>Create due recurring draft</Button></>}</>}
 {!!plan?.milestones?.length && <><Alert severity="info">Contract parent: issue its milestone invoices instead of this draft.</Alert>{plan.milestones.map((row: any) => <Typography key={row.id}>{row.milestone_name} · {row.milestone_percentage}% · {row.subtotal} · {row.status}</Typography>)}</>}
 </Stack>;
}

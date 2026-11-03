import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { BusinessButton as Button, businessStyles as s, useBusinessAction } from './BusinessUI';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../services/api';
const freshKey = () => `mail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export default function CommercialEmail({ kind, id, onChange }: {
    kind: 'invoice' | 'estimate';
    id: string;
    onChange: () => Promise<void>;
}) {
    const { t } = useLang(), action = useBusinessAction();
    const [data, setData] = useState<any>(null);
    const key = useRef(freshKey()), refreshParent = useRef(onChange);
    refreshParent.current = onChange;
    const endpoint = `/${kind === 'invoice' ? 'invoices' : 'estimates'}/${id}/email`;
    const refresh = async () => { setData(await api.get(endpoint)); };
    useEffect(() => {
        let active = true, polling = false, previous = '';
        key.current = freshKey();
        setData(null);
        const poll = async () => { if (polling)
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
                action.setError(cause.message);
        }
        finally {
            polling = false;
        } };
        void poll();
        const timer = setInterval(() => void poll(), 5000);
        return () => { active = false; clearInterval(timer); };
    }, [endpoint]);
    const job = data?.jobs?.[0], pending = ['queued', 'sending', 'uncertain'].includes(job?.status);
    const send = () => action.confirm(t(job?.status === 'sent' ? 'Send PDF again?' : 'Email PDF to client?'), data.recipient, () => void action.run(async () => {
        if (job && ['sent', 'failed', 'cancelled'].includes(job.status))
            key.current = freshKey();
        const result = await api.post<any>(endpoint, { requestKey: key.current, confirmed: true, recipient: data.recipient, fingerprint: data.fingerprint });
        setData((current: any) => ({ ...current, jobs: [result.job, ...(current.jobs || []).filter((row: any) => row.id !== result.job.id)] }));
        await refresh();
    }));
    const change = (body: any) => action.confirm(t('Confirm email status action?'), t('Verify uncertain delivery with your email provider before resolving it.'), () => void action.run(async () => { await api.post(`${endpoint}/${job.id}`, { ...body, confirmed: true }); await refresh(); await refreshParent.current(); }));
    return <View style={s.card}><Text style={s.heading}>{t('Email delivery')}</Text>{!!action.error && <Text style={s.error}>{action.error}</Text>}
 <Text style={s.body}>{data?.configured ? t('PDF email is available.') : t('Email is unavailable until SMTP is configured.')}</Text>{!!data?.recipient && <Text style={s.body}>{t('Recipient')}: {data.recipient}</Text>}
 {!!job && <Text style={s.body}>{t('Latest email')}: {t(job.status === 'sent' ? 'Accepted by email server' : job.status)}</Text>}
 <Button label={job?.status === 'sent' ? 'Send PDF again' : 'Email PDF to client'} disabled={action.busy || !data?.configured || !data?.eligible || !data?.recipient || pending} onPress={send}/>
 {job?.status === 'queued' && <Button label="Cancel queued email" disabled={action.busy} onPress={() => change({ action: 'cancel' })}/>}
 {job?.status === 'uncertain' && <><Text style={s.body}>{t('Delivery is uncertain. Automatic resend is paused to avoid duplicates.')}</Text><Button label="Confirm email was sent" disabled={action.busy} onPress={() => change({ action: 'resolve', delivered: true })}/><Button label="Confirm email was not sent" disabled={action.busy} onPress={() => change({ action: 'resolve', delivered: false })}/></>}
 </View>;
}

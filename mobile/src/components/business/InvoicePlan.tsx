import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { BusinessButton as Button, BusinessChoice as Choice, BusinessField as Field, businessStyles as s, useBusinessAction } from './BusinessUI';
import { useLang } from '../../context/LanguageContext';
import { api } from '../../services/api';
export default function InvoicePlan({ id, onOpen }: {
    id: string;
    onOpen: (id: string) => void;
}) {
    const { t } = useLang(), action = useBusinessAction();
    const [plan, setPlan] = useState<any>(null), [enabled, setEnabled] = useState(false), [frequency, setFrequency] = useState('monthly'), [end, setEnd] = useState('');
    const load = async () => { const result = await api.get<any>(`/invoices/${id}/billing-plan`); setPlan(result); setEnabled(!!result.isRecurring); setFrequency(result.frequency || 'monthly'); setEnd(String(result.endDate || '').slice(0, 10)); };
    useEffect(() => { let active = true; void api.get<any>(`/invoices/${id}/billing-plan`).then(result => { if (active) {
        setPlan(result);
        setEnabled(!!result.isRecurring);
        setFrequency(result.frequency || 'monthly');
        setEnd(String(result.endDate || '').slice(0, 10));
    } }).catch(error => { if (active)
        action.setError(error.message); }); return () => { active = false; }; }, [id]);
    const save = () => action.confirm(t('Save recurring schedule?'), t('Due occurrences create drafts only. They are not emailed or charged automatically.'), () => void action.run(async () => { await api.put(`/invoices/${id}/billing-plan`, { isRecurring: enabled, recurringFrequency: frequency, recurringEndDate: end || null }); await load(); }));
    const generate = () => action.confirm(t('Create this recurring draft?'), plan.nextDate, () => void action.run(async () => { const result = await api.post<any>(`/invoices/${id}/recurring-next`, { index: plan.index, confirmed: true }); await load(); if (result.invoice)
        onOpen(result.invoice.id);
    else
        action.setNotice(t(result.ended ? 'Recurring schedule ended.' : 'The next occurrence is not due yet.')); }));
    return <View style={s.card}><Text style={s.heading}>{t('Billing plan')}</Text>{!!action.error && <Text style={s.error}>{action.error}</Text>}{!!action.notice && <Text style={s.body}>{action.notice}</Text>}
 {plan && !plan.generatedFromId && !plan.parentId && !plan.milestones.length && plan.status === 'draft' && <><Button label="Recurring schedule" selected={enabled} disabled={action.busy} onPress={() => setEnabled(value => !value)}/>{enabled && <><Choice label="Frequency" value={frequency} onChange={setFrequency} disabled={action.busy} options={['weekly', 'monthly', 'quarterly'].map(value => ({ value, label: t(value) }))}/><Field label="Recurring end date (optional YYYY-MM-DD)" value={end} onChange={setEnd} disabled={action.busy}/></>}<Button label="Save recurring schedule" disabled={action.busy} onPress={save}/></>}
 {!!plan?.isRecurring && <><Text style={s.body}>{t('Next draft')}: {plan.nextDate} · {t(plan.enabled ? 'Schedule enabled' : 'Schedule paused')}</Text><Text style={s.body}>{t('Due occurrences create drafts only. They are not emailed or charged automatically.')}</Text>{plan.status !== 'draft' && <><Button label={plan.enabled ? 'Pause recurring schedule' : 'Resume recurring schedule'} disabled={action.busy} onPress={() => action.confirm(t('Change recurring schedule?'), t('This affects future draft generation.'), () => void action.run(async () => { await api.put(`/invoices/${id}/billing-plan`, { enabled: !plan.enabled }); await load(); }))}/><Button label="Create due recurring draft" disabled={action.busy || !plan.enabled || plan.ended || plan.nextDate > plan.today} onPress={generate}/></>}</>}
 {!!plan?.milestones?.length && <><Text style={s.body}>{t('Contract parent: issue its milestone invoices instead of this draft.')}</Text>{plan.milestones.map((row: any) => <Button key={row.id} label={`${row.milestone_name} · ${row.milestone_percentage}% · ${row.subtotal} · ${t(row.status)}`} disabled={action.busy} onPress={() => onOpen(row.id)}/>)}</>}
 </View>;
}

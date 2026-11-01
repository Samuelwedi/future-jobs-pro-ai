import React, {useCallback, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {BusinessButton as Button, BusinessChoice as Choice, BusinessField as Field, BusinessPage as Page, businessStyles as s, useBusinessAction} from '../components/business/BusinessUI';
import {useLang} from '../context/LanguageContext';
import {api} from '../services/api';
import {workAvailabilityRange} from '../utils/localWorkDate';

type Options = {actorId: string; manager: boolean; people: {id: string; name: string}[]; shifts: {id: string; name: string; date: string}[]};
type Unavailability = {id: string; user_id: string; starts_at: string; ends_at: string};
type Swap = {id: string; shift_id: string; from_user: string; to_user: string; status: string};
const base = '/operations';
export default function WorkPreferencesScreen() {
  const {t} = useLang(), action = useBusinessAction();
  const [data, setData] = useState<Options | null>(null);
  const [availability, setAvailability] = useState<Unavailability[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [from, setFrom] = useState(''), [until, setUntil] = useState('');
  const [shift, setShift] = useState(''), [replacement, setReplacement] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    const [options, blocked, requests] = await Promise.all([
      api.get<Options>(base + '/work-options'), api.get<Unavailability[]>(base + '/availability'), api.get<Swap[]>(base + '/swaps'),
    ]);
    if (current !== sequence.current) return;
    setData(options); setAvailability(blocked); setSwaps(requests);
    setShift(previous => options.shifts.some(row => row.id === previous) ? previous : '');
    setReplacement(previous => options.people.some(row => row.id === previous && row.id !== options.actorId) ? previous : '');
  }, []);
  useFocusEffect(useCallback(() => {
    void load().catch(cause => action.setError(cause.message));
    return () => {sequence.current++;};
  }, [load]));
  const name = (id: string) => data?.people.find(person => person.id === id)?.name || t('Unavailable member');
  const mutate = (work: () => Promise<unknown>) => action.run(async () => {await work(); await load();});
  const save = () => action.run(async () => {
    let range;
    try {range = workAvailabilityRange(from, until);} catch (cause: any) {throw Error(t(cause.message));}
    await api.post(base + '/availability', range);
    // A successful write is not retried if refreshing the list subsequently fails.
    setFrom(''); setUntil(''); action.setNotice(t('Unavailability saved.'));
    await load();
  });
  const approve = (swap: Swap) => action.confirm(t('Approve replacement?'), t('The server rechecks availability and shift conflicts before replacing the assignment.'), () => void mutate(() => api.post(base + '/swaps/' + swap.id + '/approve', {requestKey: 'mobile-cover-' + swap.id})));
  return <Page title="Availability & shift cover" {...action}>
    <Button label="Refresh" disabled={action.busy} onPress={() => void action.run(load)}/>
    <View style={s.card}>
      <Text style={s.heading}>{t('When you cannot work')}</Text>
      <Text style={s.body}>{t('Dates use your device timezone.')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
      <Field label="From (YYYY-MM-DD HH:mm)" value={from} onChange={setFrom} disabled={action.busy}/>
      <Field label="Until (YYYY-MM-DD HH:mm)" value={until} onChange={setUntil} disabled={action.busy}/>
      <Button label="Save unavailability" disabled={action.busy || !data || !from || !until} onPress={() => void save()}/>
      {availability.map(row => <View key={row.id} style={s.card}>
        <Text style={s.body}>{name(row.user_id)} · {new Date(row.starts_at).toLocaleString()} — {new Date(row.ends_at).toLocaleString()}</Text>
        {(data?.manager || row.user_id === data?.actorId) && <Button label="Remove" disabled={action.busy} onPress={() => action.confirm(t('Remove unavailability?'), name(row.user_id), () => void mutate(() => api.delete(base + '/availability/' + row.id)))}/>}
      </View>)}
    </View>
    <View style={s.card}>
      <Text style={s.heading}>{t('Request a replacement')}</Text>
      <Text style={s.body}>{t('The replacement must accept, then a manager approves after checking availability and conflicts.')}</Text>
      <Choice label="Your upcoming shift" value={shift} onChange={setShift} disabled={action.busy} options={(data?.shifts || []).map(row => ({value: row.id, label: `${row.name} · ${String(row.date).slice(0, 10)}`}))}/>
      <Choice label="Ask this colleague" value={replacement} onChange={setReplacement} disabled={action.busy} options={(data?.people || []).filter(person => person.id !== data?.actorId).map(person => ({value: person.id, label: person.name}))}/>
      <Button label="Request cover" disabled={action.busy || !shift || !replacement} onPress={() => action.confirm(t('Request cover?'), name(replacement), () => void mutate(async () => {await api.post(base + '/swaps', {shiftId: shift, toUser: replacement}); setShift(''); setReplacement('');}))}/>
      {swaps.map(row => <View key={row.id} style={s.card}>
        <Text style={s.body}>{name(row.from_user)} → {name(row.to_user)} · {t(row.status)}</Text>
        <Text style={s.body}>{data?.shifts.find(item => item.id === row.shift_id)?.name || row.shift_id}</Text>
        {row.status === 'pending' && row.to_user === data?.actorId && <View style={s.row}>
          <Button label="Accept" disabled={action.busy} onPress={() => action.confirm(t('Accept cover request?'), name(row.from_user), () => void mutate(() => api.post(base + '/swaps/' + row.id + '/respond', {status: 'accepted'})))}/>
          <Button label="Decline" disabled={action.busy} onPress={() => action.confirm(t('Decline cover request?'), name(row.from_user), () => void mutate(() => api.post(base + '/swaps/' + row.id + '/respond', {status: 'rejected'})))}/>
        </View>}
        {row.status === 'accepted' && data?.manager && <Button label="Approve replacement" disabled={action.busy} onPress={() => approve(row)}/>}
      </View>)}
    </View>
  </Page>;
}

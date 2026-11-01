import React, { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BusinessButton as Button, BusinessPage as Page, businessStyles as s, useBusinessAction } from '../components/business/BusinessUI';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';
import { shareBusinessFile } from '../services/businessDownload';
type Options = {
    entry: any;
    photos: any[];
    voiceNotes: any[];
    attachments: any[];
    gps: any[];
};
export default function EvidenceScreen() {
    const { t } = useLang(), action = useBusinessAction();
    const [entries, setEntries] = useState<any[]>([]), [id, setId] = useState(''), [data, setData] = useState<Options | null>(null);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [generated, setGenerated] = useState({ gpsVideo: true, timePdf: true, voiceVideos: true });
    const sequence = useRef(0);
    const load = useCallback(async () => { const current = ++sequence.current; const result = await api.get<any>('/evidence-bundles/recent'); if (current === sequence.current)
        setEntries(result.entries || []); }, []);
    useFocusEffect(useCallback(() => { void load().catch(cause => action.setError(cause.message)); return () => { sequence.current++; }; }, [load]));
    const open = (entryId: string) => action.run(async () => { setData(null); setId(entryId); const result = await api.get<Options>('/evidence-bundles/time-entry/' + entryId); setSelected(Object.fromEntries([...result.photos, ...result.voiceNotes, ...result.attachments].map(row => [row.id, true]))); setData(result); });
    const download = (path: string, name: string, body?: unknown) => action.run(() => shareBusinessFile('/evidence-bundles/' + path, name, body));
    const packageDownload = () => action.confirm(t('Generate evidence package?'), t('The package contains the selected originals, derived records, GPS data and verification manifest.'), () => void action.run(async () => {
        if (!data)
            return;
        await shareBusinessFile(`/evidence-bundles/time-entry/${id}/download`, `evidence-${id}.zip`, { photoIds: data.photos.filter(row => selected[row.id]).map(row => row.id), voiceNoteIds: data.voiceNotes.filter(row => selected[row.id]).map(row => row.id), attachmentIds: data.attachments.filter(row => selected[row.id]).map(row => row.id), includeGpsVideo: generated.gpsVideo, includeTimeEntryPdf: generated.timePdf, includeVoiceVideos: generated.voiceVideos });
    }));
    return <Page title="Evidence center" {...action}>
  <Text style={s.body}>{t('Select evidence from stored work records. Generated media is derived evidence; original timestamps and coordinates remain authoritative.')}</Text>
  <Text style={s.body}>{t('Mobile sharing supports packages up to 25 MB. Choose fewer files for larger records.')}</Text>
  <Button label="Refresh" disabled={action.busy} onPress={() => void action.run(load)}/>
  {data && <View style={s.card}>
   <Text style={s.heading}>{data.entry.employee_name} · {data.entry.project_name || t('No project')}</Text><Text style={s.body}>{data.entry.clock_in} — {data.entry.clock_out || t('Active')}</Text><Text style={s.body}>GPS: {data.gps.length}</Text>
   {(['gpsVideo', 'timePdf', 'voiceVideos'] as const).map((key, index) => <Button key={key} label={['Include GPS video', 'Include time-entry PDF', 'Include voice caption videos'][index]} selected={generated[key]} disabled={action.busy} onPress={() => setGenerated(current => ({ ...current, [key]: !current[key] }))}/>)}
   <Button label="Share time-entry PDF" disabled={action.busy} onPress={() => void download(`time-entry/${id}/time-entry-pdf`, `time-entry-${id}.pdf`)}/>
   <Button label="Share GPS video" disabled={action.busy || data.gps.length < 2} onPress={() => void download(`time-entry/${id}/gps-video`, `gps-${id}.mp4`)}/>
   {([['Photos and videos', data.photos], ['Voice notes', data.voiceNotes], ['Documents', data.attachments]] as const).map(([label, items]) => <View key={label} style={s.card}><Text style={s.heading}>{t(label)}</Text>{items.map(row => <View key={row.id}>
    <Button label={row.file_name || row.transcript || `${row.file_type || label} · ${row.taken_at || row.created_at || row.id}`} selected={!!selected[row.id]} disabled={action.busy} onPress={() => setSelected(current => ({ ...current, [row.id]: !current[row.id] }))}/>
    {label === 'Voice notes' && <Button label="Share voice caption video" disabled={action.busy} onPress={() => void download(`voice-note/${row.id}/caption-video`, `voice-${row.id}.mp4`)}/>}
   </View>)}</View>)}
   <Button label="Generate and share package" disabled={action.busy} onPress={packageDownload}/>
   <Button label="Close selection" disabled={action.busy} onPress={() => { setData(null); setId(''); }}/>
  </View>}
  {entries.map(entry => <View key={entry.id} style={s.card}><Text style={s.heading}>{entry.employee_name}</Text><Text style={s.body}>{entry.project_name || t('No project')} · {new Date(entry.clock_in).toLocaleString()}</Text><Text style={s.body}>{entry.media_count} {t('Media files')} · {entry.voice_count} {t('Voice notes')} · {entry.gps_count} GPS</Text><Button label="Select evidence" disabled={action.busy} onPress={() => void open(entry.id)}/></View>)}
 </Page>;
}

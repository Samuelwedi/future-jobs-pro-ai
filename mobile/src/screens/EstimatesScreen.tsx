import React, {useCallback, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {BusinessButton as Button, BusinessChoice as Choice, BusinessField as Field, BusinessPage as Page, businessStyles as s, useBusinessAction} from '../components/business/BusinessUI';
import {api} from '../services/api';
import {shareBusinessFile} from '../services/businessDownload';
import {businessRangeError, positiveMoney} from '../utils/businessValidation';
import {localExpenseDate} from '../utils/expenseForm';
import {useLang} from '../context/LanguageContext';
type Line = {description: string; quantity: string; unit_price: string};
const blank = (): Line => ({description: '', quantity: '1', unit_price: ''});
export default function EstimatesScreen() {
  const {t} = useLang(), action = useBusinessAction();
  const [rows, setRows] = useState<any[]>([]), [projects, setProjects] = useState<any[]>([]), [clients, setClients] = useState<any[]>([]);
  const [filter, setFilter] = useState(''), [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<any>(null), [editor, setEditor] = useState(false), [edit, setEdit] = useState('');
  const [project, setProject] = useState(''), [client, setClient] = useState('');
  const [issue, setIssue] = useState(localExpenseDate), [expiry, setExpiry] = useState(localExpenseDate), [tax, setTax] = useState('0');
  const [notes, setNotes] = useState(''), [clientNotes, setClientNotes] = useState(''), [lines, setLines] = useState<Line[]>([blank()]);
  const [invoiceDate, setInvoiceDate] = useState(localExpenseDate), [dueDate, setDueDate] = useState(localExpenseDate);
  const sequence = useRef(0), key = useRef('');
  const load = useCallback(async () => {
    const current = ++sequence.current;
    const [list, projectRows, people] = await Promise.all([
      api.get<any>('/estimates?' + new URLSearchParams({limit: '50', offset: String(offset), ...(filter ? {status: filter} : {})})),
      api.get<any>('/projects'), api.get<any>('/users/company'),
    ]);
    if (current !== sequence.current) return;
    setRows(list.estimates || []); setProjects(Array.isArray(projectRows) ? projectRows : projectRows.projects || []); setClients(people.users || []);
  }, [filter, offset]);
  useFocusEffect(useCallback(() => {void load().catch(cause => action.setError(cause.message)); return () => {sequence.current++;};}, [load]));
  const open = async (id: string) => {setDetail(await api.get('/estimates/' + id)); setEditor(false);};
  const fresh = () => {
    key.current = `mobile-estimate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setEdit(''); setProject(''); setClient(''); setIssue(localExpenseDate()); setExpiry(localExpenseDate()); setTax('0'); setNotes(''); setClientNotes(''); setLines([blank()]); setDetail(null); setEditor(true);
  };
  const editDraft = () => {
    const row = detail.estimate; setEdit(row.id); setProject(row.project_id || ''); setClient(row.client_id || '');
    setIssue(String(row.issue_date).slice(0, 10)); setExpiry(String(row.expiry_date || row.issue_date).slice(0, 10)); setTax(String(row.tax_rate || 0));
    setNotes(row.notes || ''); setClientNotes(row.client_notes || ''); setLines(detail.items.map((item: any) => ({description: item.description, quantity: String(item.quantity), unit_price: String(item.unit_price)}))); setEditor(true);
  };
  const save = () => action.run(async () => {
    const error = businessRangeError(issue, expiry); if (error) throw Error(t(error));
    if (!positiveMoney(tax, true) || Number(tax) > 100) throw Error(t('Enter a tax percentage between 0 and 100.'));
    if (!lines.length || lines.some(line => !line.description.trim() || !positiveMoney(line.quantity) || !positiveMoney(line.unit_price, true))) throw Error(t('Every line needs a description, positive quantity and valid unit price.'));
    const payload = {requestKey: key.current, projectId: project || null, clientId: client || null, issueDate: issue, expiryDate: expiry, taxRate: Number(tax), notes, clientNotes, items: lines.map(line => ({...line, quantity: Number(line.quantity), unit_price: Number(line.unit_price)}))};
    const result = edit ? await api.put<any>('/estimates/' + edit, payload) : await api.post<any>('/estimates', payload);
    setEditor(false); await open(result.estimate.id); await load(); action.setNotice(t('Estimate draft saved.'));
  });
  const record = (step: 'send' | 'accept' | 'reject') => action.confirm(t('Record external estimate action?'), t('Confirm delivery or the client decision outside the app. This does not send email.'), () => void action.run(async () => {
    await api.post('/estimates/' + detail.estimate.id + '/' + step, {}); await open(detail.estimate.id); await load();
  }));
  const convert = () => action.confirm(t('Convert accepted estimate?'), t('This creates one draft invoice. Repeating the request returns the same invoice.'), () => void action.run(async () => {
    const error = businessRangeError(invoiceDate, dueDate); if (error) throw Error(t(error));
    const result = await api.post<any>('/estimates/' + detail.estimate.id + '/convert', {invoiceDate, dueDate}); await open(detail.estimate.id); await load(); action.setNotice(`${t('Draft invoice created')}: ${result.invoice.invoice_number || result.invoice.id}`);
  }));
  return <Page title="Estimates" {...action}>
    <Button label="New estimate draft" disabled={action.busy} onPress={fresh}/>
    <Choice label="Status" value={filter} disabled={action.busy} onChange={value => {setFilter(value); setOffset(0); setDetail(null);}} options={[{value: '', label: t('All statuses')}, ...['draft', 'sent', 'accepted', 'rejected', 'converted'].map(value => ({value, label: t(value)}))]}/>
    <Button label="Refresh" disabled={action.busy} onPress={() => void action.run(load)}/>
    {editor && <View style={s.card}>
      <Choice label="Project" value={project} onChange={setProject} disabled={action.busy} options={[{value: '', label: t('No project')}, ...projects.map(row => ({value: row.id, label: row.name}))]}/>
      <Choice label="Client" value={client} onChange={setClient} disabled={action.busy} options={[{value: '', label: t('Use project client')}, ...clients.map(row => ({value: row.id, label: row.full_name || `${row.first_name} ${row.last_name}`}))]}/>
      <Field label="Issue date (YYYY-MM-DD)" value={issue} onChange={setIssue} disabled={action.busy}/>
      <Field label="Expiry date (YYYY-MM-DD)" value={expiry} onChange={setExpiry} disabled={action.busy}/>
      <Field label="Tax percentage" value={tax} onChange={setTax} numeric disabled={action.busy}/>
      {lines.map((line, index) => <View key={index} style={s.card}>
        {(['description', 'quantity', 'unit_price'] as const).map((field, i) => <Field key={field} label={['Description', 'Quantity', 'Unit price'][i]} value={line[field]} numeric={i > 0} disabled={action.busy} onChange={value => setLines(current => current.map((row, j) => j === index ? {...row, [field]: value} : row))}/>)}
        <Button label="Remove line" disabled={action.busy} onPress={() => setLines(current => current.filter((_, j) => j !== index))}/>
      </View>)}
      <Button label="Add line" disabled={action.busy || lines.length >= 500} onPress={() => setLines(current => [...current, blank()])}/>
      <Field label="Internal notes" value={notes} onChange={setNotes} multiline disabled={action.busy}/><Field label="Client notes" value={clientNotes} onChange={setClientNotes} multiline disabled={action.busy}/>
      <Button label="Save draft" disabled={action.busy} onPress={() => action.confirm(t('Save estimate draft?'), t('Review every amount before saving.'), () => void save())}/>
      <Button label="Close editor" disabled={action.busy} onPress={() => setEditor(false)}/>
    </View>}
    {detail && !editor && <View style={s.card}>
      <Text style={s.heading}>{detail.estimate.estimate_number || detail.estimate.id}</Text><Text style={s.body}>{t(detail.estimate.status)} · {t('Total')}: {detail.estimate.total ?? detail.estimate.subtotal}</Text>
      <Button label="Share estimate PDF" disabled={action.busy} onPress={() => void action.run(() => shareBusinessFile(`/estimates/${detail.estimate.id}/pdf`, `estimate-${detail.estimate.id}.pdf`))}/>
      {detail.items.map((line: any) => <Text key={line.id} style={s.body}>{line.description}: {line.quantity} × {line.unit_price}</Text>)}
      {detail.estimate.status === 'draft' && <><Button label="Edit draft" disabled={action.busy} onPress={editDraft}/><Button label="Record external delivery" disabled={action.busy} onPress={() => record('send')}/><Button label="Delete draft" disabled={action.busy} onPress={() => action.confirm(t('Delete this draft?'), t('Only a draft can be deleted.'), () => void action.run(async () => {await api.delete('/estimates/' + detail.estimate.id); setDetail(null); await load();}))}/></>}
      {detail.estimate.status === 'sent' && <><Button label="Record client acceptance" disabled={action.busy} onPress={() => record('accept')}/><Button label="Record client rejection" disabled={action.busy} onPress={() => record('reject')}/></>}
      {detail.estimate.status === 'accepted' && <><Field label="Invoice date (YYYY-MM-DD)" value={invoiceDate} onChange={setInvoiceDate} disabled={action.busy}/><Field label="Due date (YYYY-MM-DD)" value={dueDate} onChange={setDueDate} disabled={action.busy}/><Button label="Convert to draft invoice" disabled={action.busy} onPress={convert}/></>}
      {!!detail.estimate.converted_to_invoice_id && <Text style={s.body}>{t('Draft invoice created')}: {detail.estimate.converted_to_invoice_id}</Text>}
    </View>}
    {rows.map(row => <View key={row.id} style={s.card}><Text style={s.heading}>{row.estimate_number || row.id}</Text><Text style={s.body}>{row.client_name || row.project_name} · {t(row.status)} · {row.total ?? row.subtotal}</Text><Button label="View estimate" disabled={action.busy} onPress={() => void action.run(() => open(row.id))}/></View>)}
    <View style={s.row}><Button label="Previous page" disabled={action.busy || offset === 0} onPress={() => setOffset(value => Math.max(0, value - 50))}/><Button label="Next page" disabled={action.busy || rows.length < 50} onPress={() => setOffset(value => value + 50)}/></View>
  </Page>;
}

import React, {useCallback, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {BusinessButton as Button, BusinessChoice as Choice, BusinessField as Field, BusinessPage as Page, businessStyles as s, useBusinessAction} from '../components/business/BusinessUI';
import {useLang} from '../context/LanguageContext';
import {api} from '../services/api';
import {shareBusinessRecord} from '../services/businessDownload';
const identityFields = [['Operating name','name'],['Legal name','legal_name'],['Business number','business_number'],['Payroll account number','payroll_account_number'],['Address','address'],['City','city'],['Province','province'],['Postal code','postal_code'],['Phone','phone'],['Payroll email','email']];
export default function YearEndScreen() {
  const {t} = useLang(), action = useBusinessAction(), nav = useNavigation<any>();
  const [employees, setEmployees] = useState<any[]>([]), [employee, setEmployee] = useState(''), [forms, setForms] = useState<string[]>([]), [form, setForm] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear())), [archiveForm, setArchiveForm] = useState('');
  const [archive, setArchive] = useState<any[]>([]), [stored, setStored] = useState<any>(null), [preview, setPreview] = useState<any>(null);
  const [company, setCompany] = useState<any>({}), [editCompany, setEditCompany] = useState(false);
  const sequence = useRef(0);
  const validYear = () => {const number = Number(year); if (!/^\d{4}$/.test(year) || number < 2000 || number > new Date().getFullYear() + 1) throw Error(t('Invalid tax year')); return number;};
  const load = useCallback(async () => {
    const current = ++sequence.current;
    const [people, identity] = await Promise.all([api.get<any>('/users/company'), api.get<any>('/workforce-operations/company')]);
    if (current !== sequence.current) return;
    setEmployees(people.users || []); setCompany(identity.company || {});
  }, []);
  useFocusEffect(useCallback(() => {void load().catch(cause => action.setError(cause.message)); return () => {sequence.current++;};}, [load]));
  const selectEmployee = (id: string) => action.run(async () => {
    setEmployee(id); setPreview(null); setForms([]); setForm('');
    const response = await api.get<any>('/year-end/employee/' + id + '/forms'); setForms(response.availableForms || []); setForm(response.availableForms?.[0] || '');
  });
  const loadArchive = async () => {
    validYear(); const response = await api.get<any>('/year-end/finalized?' + new URLSearchParams({taxYear: year, ...(archiveForm ? {formType: archiveForm} : {})})); setArchive(response.slips || []); setStored(null);
  };
  const loadPreview = () => action.run(async () => {
    validYear(); if (!employee || !form) return;
    const result = await api.get<any>('/year-end/preview?' + new URLSearchParams({employeeId: employee, taxYear: year, formType: form}));
    setPreview({...result, selection: `${employee}:${year}:${form}`});
  });
  const currentPreview = preview?.selection === `${employee}:${year}:${form}` ? preview : null;
  const finalize = () => action.confirm(t('Finalize reviewed form?'), t('This stores a company record. It does not file with a tax authority. Review every amount independently.'), () => void action.run(async () => {
    if (!currentPreview) throw Error(t('Load and review a fresh preview.'));
    await api.post('/year-end/finalize', {employeeId: employee, taxYear: validYear(), formType: form, previewHash: currentPreview.previewHash}); setPreview(null); await loadArchive(); action.setNotice(t('Year-end record finalized.'));
  }));
  const saveCompany = () => action.confirm(t('Save company payroll identity?'), t('These values appear on payroll and year-end forms.'), () => void action.run(async () => {
    await api.patch('/workforce-operations/company', {name: company.name, legalName: company.legal_name, businessNumber: company.business_number, payrollAccountNumber: company.payroll_account_number, address: company.address, city: company.city, province: company.province, postalCode: company.postal_code, phone: company.phone, email: company.email});
    setEditCompany(false); setPreview(null); await load();
  }));
  const values = (record: any) => Object.entries(record || {}).map(([key, value]) => <Text key={key} style={s.body}>{key.replace(/_/g, ' ')}: {value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text>);
  return <Page title="Year-end forms" {...action}>
    <Text style={s.body}>{t('Canadian form previews use stored payroll records. They are not tax filing or government approval. Worldwide company rules require your local filing process.')}</Text>
    <View style={s.card}><Text style={s.heading}>{t('Employer identity')}</Text>
      {identityFields.map(([label, key]) => <Field key={key} label={label} value={String(company[key] || '')} onChange={value => {setCompany((current: any) => ({...current, [key]: value})); setPreview(null);}} disabled={action.busy || !editCompany}/>)}
      <Button label={editCompany ? 'Save company information' : 'Edit company information'} disabled={action.busy} onPress={() => editCompany ? saveCompany() : setEditCompany(true)}/>
      {editCompany && <Button label="Cancel" disabled={action.busy} onPress={() => void action.run(async () => {setEditCompany(false); await load();})}/>}
    </View>
    <View style={s.card}><Field label="Tax year" value={year} onChange={value => {setYear(value); setPreview(null); setArchive([]); setStored(null);}} numeric disabled={action.busy}/>
      <Choice label="Employee" value={employee} onChange={value => void selectEmployee(value)} disabled={action.busy} options={employees.map(row => ({value: row.id, label: row.full_name || `${row.first_name} ${row.last_name}`}))}/>
      <Choice label="Form" value={form} onChange={value => {setForm(value); setPreview(null);}} disabled={action.busy} options={forms.map(value => ({value, label: value}))}/>
      <Button label="Preview form" disabled={action.busy || !employee || !form || editCompany} onPress={() => void loadPreview()}/>
      {currentPreview && <View style={s.card}>{values(currentPreview.preview.employer)}{values(currentPreview.preview.employee)}{values(currentPreview.preview.t4Manifest || currentPreview.preview.t4aManifest || currentPreview.preview.rl1Manifest)}{values(currentPreview.preview.employerMetrics)}<Button label="Finalize reviewed form" disabled={action.busy} onPress={finalize}/></View>}
    </View>
    <View style={s.card}><Text style={s.heading}>{t('Finalized archive')}</Text><Choice label="Form" value={archiveForm} onChange={value => {setArchiveForm(value); setArchive([]); setStored(null);}} disabled={action.busy} options={[{value: '', label: t('All forms')}, ...['T4','T4A','RL1'].map(value => ({value, label: value}))]}/><Button label="Load finalized archive" disabled={action.busy} onPress={() => void action.run(loadArchive)}/>
      {archive.map(row => <Button key={`${row.form_type}-${row.id}`} label={`${row.employee_name} · ${row.form_type} · ${row.tax_year}`} disabled={action.busy} onPress={() => void action.run(async () => {const result = await api.get<any>(`/year-end/finalized/${row.form_type}/${row.id}`); setStored({...result.slip, form_type: result.formType});})}/>)}
      {!!stored && <View style={s.card}>{values(stored)}<Button label="Share saved record" disabled={action.busy} onPress={() => void action.run(() => shareBusinessRecord(stored, `${stored.form_type}-${stored.tax_year}-${stored.id}`))}/></View>}
    </View><Button label="Payroll" onPress={() => nav.navigate('Payroll')} disabled={action.busy}/>
  </Page>;
}

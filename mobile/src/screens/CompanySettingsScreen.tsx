import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface CompanySettings {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  overtime_mode: 'daily' | 'weekly' | 'daily_weekly';
  overtime_daily_threshold_hours: number;
  overtime_week_start: number;
  timezone: string;
  overtime_enabled: boolean;
  overtime_threshold_hours: number;
  overtime_multiplier: number;
  default_hourly_rate: number;
}

interface CompanyResponse {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

interface SettingsResponse {
  success: boolean;
  settings: {
    overtime_mode: 'daily' | 'weekly' | 'daily_weekly';
  overtime_daily_threshold_hours: number;
  overtime_week_start: number;
  timezone: string;
  overtime_enabled: boolean;
    overtime_threshold_hours: number;
    overtime_multiplier: number;
    default_hourly_rate: number;
  };
}

export default function CompanySettingsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>({
    id: '',
    name: '',
    logo_url: null,
    address: null,
    phone: null,
    email: null,
    overtime_mode: 'weekly',
    overtime_daily_threshold_hours: 8,
    overtime_week_start: 1,
    timezone: 'UTC',
    overtime_enabled: true,
    overtime_threshold_hours: 40,
    overtime_multiplier: 1.5,
    default_hourly_rate: 20,
  });
  const [originalSettings, setOriginalSettings] = useState<CompanySettings>(settings);
  const [logoFile, setLogoFile] = useState<any>(null);

  // ─── String states for decimal inputs ───
  const [dailyStr, setDailyStr] = useState('8');
  const [thresholdStr, setThresholdStr] = useState('40');
  const [multiplierStr, setMultiplierStr] = useState('1.5');
  const [hourlyRateStr, setHourlyRateStr] = useState('20');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const companyRes = await api.get<CompanyResponse>(`/companies/${user?.companyId}`);
      const companyData = (companyRes as any).data ?? companyRes;

      const settingsRes = await api.get<SettingsResponse>(`/companies/${user?.companyId}/settings`);
      const settingsData = (settingsRes as any).data ?? settingsRes;

      const merged: CompanySettings = {
        id: companyData.id,
        name: companyData.name || '',
        logo_url: companyData.logo_url || null,
        address: companyData.address || null,
        phone: companyData.phone || null,
        email: companyData.email || null,
        overtime_mode: settingsData.settings?.overtime_mode ?? 'weekly',
        overtime_daily_threshold_hours: settingsData.settings?.overtime_daily_threshold_hours ?? 8,
        overtime_week_start: settingsData.settings?.overtime_week_start ?? 1,
        timezone: settingsData.settings?.timezone ?? 'UTC',
        overtime_enabled: settingsData.settings?.overtime_enabled ?? true,
        overtime_threshold_hours: settingsData.settings?.overtime_threshold_hours ?? 40,
        overtime_multiplier: settingsData.settings?.overtime_multiplier ?? 1.5,
        default_hourly_rate: settingsData.settings?.default_hourly_rate ?? 20,
      };
      setSettings(merged);
      setOriginalSettings(merged);
      // Update string states
      setDailyStr(String(merged.overtime_daily_threshold_hours));
      setThresholdStr(String(merged.overtime_threshold_hours));
      setMultiplierStr(String(merged.overtime_multiplier));
      setHourlyRateStr(String(merged.default_hourly_rate));
    } catch (e) {
      console.error('Error fetching settings:', e);
      Alert.alert('Error', 'Could not load company settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    // Convert strings to numbers
    const threshold = thresholdStr.trim() ? Number(thresholdStr) : NaN;
    const daily = dailyStr.trim() ? Number(dailyStr) : NaN;
    const multiplier = multiplierStr.trim() ? Number(multiplierStr) : NaN;
    const hourlyRate = hourlyRateStr.trim() ? Number(hourlyRateStr) : NaN;

    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 168 || !Number.isFinite(daily) || daily <= 0 || daily > 24) {
      Alert.alert('Invalid Value', 'Enter daily hours greater than 0 up to 24, and weekly hours greater than 0 up to 168. Decimal hours are accepted.');
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) {
      Alert.alert('Invalid Value', 'Overtime multiplier must be between 1 and 10.');
      return;
    }
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      Alert.alert('Invalid Value', 'Hourly rate must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/companies/${user?.companyId}/settings`, {
        overtime_mode: settings.overtime_mode,
        overtime_daily_threshold_hours: daily,
        overtime_week_start: settings.overtime_week_start,
        timezone: settings.timezone.trim(),
        overtime_enabled: settings.overtime_enabled,
        overtime_threshold_hours: threshold,
        overtime_multiplier: multiplier,
        default_hourly_rate: hourlyRate,
      });

      // Update general company info if changed
      if (
        settings.name !== originalSettings.name ||
        settings.address !== originalSettings.address ||
        settings.phone !== originalSettings.phone ||
        settings.email !== originalSettings.email
      ) {
        await api.put(`/companies/${user?.companyId}`, {
          name: settings.name,
          address: settings.address,
          phone: settings.phone,
          email: settings.email,
        });
      }

      // Upload logo if selected
      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', {
          uri: logoFile.uri,
          name: 'logo.png',
          type: 'image/png',
        } as any);
        await api.post(`/companies/${user?.companyId}/logo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setLogoFile(null);
      }

      Alert.alert('✅ Success', 'Company settings updated.');
      fetchSettings();
    } catch (e: any) {
      console.error('Error saving settings:', e);
      Alert.alert('Error', e?.response?.data?.message || e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setLogoFile({ uri: asset.uri, name: 'logo.png', type: 'image/png' });
      setSettings({ ...settings, logo_url: asset.uri });
    }
  };

  const applyPreset = (mode: 'daily' | 'weekly', hours: number) => {
    setSettings(current => ({...current, overtime_enabled:true, overtime_mode:mode}));
    if(mode==='daily')setDailyStr(String(hours));else setThresholdStr(String(hours));
  };
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dailyLimit = settings.overtime_enabled && settings.overtime_mode!=='weekly' ? Number(dailyStr) : Infinity;
  const weeklyLimit = settings.overtime_enabled && settings.overtime_mode!=='daily' ? Number(thresholdStr) : Infinity;
  const exampleRegular = Math.max(0,Math.min(45,5*Math.min(9,dailyLimit),weeklyLimit));
  const example = Number.isFinite(exampleRegular) ? `Example: five 9-hour days = ${exampleRegular.toFixed(2)} regular hours + ${(45-exampleRegular).toFixed(2)} overtime hours.` : 'Enter valid thresholds to see an example.';

  if (loading) {
    return <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Company Settings</Text>
        <TouchableOpacity onPress={saveSettings} disabled={saving}>
          <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.logoSection}>
        {settings.logo_url ? (
          <Image source={{ uri: settings.logo_url }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <MaterialIcons name="business" size={48} color="#666" />
          </View>
        )}
        <TouchableOpacity style={styles.uploadBtn} onPress={pickLogo}>
          <MaterialIcons name="upload" size={20} color="#00D4FF" />
          <Text style={styles.uploadBtnText}>Change Logo</Text>
        </TouchableOpacity>
      </View>

      <Section title="Company Profile" icon="business">
        <InputField
          label="Company Name"
          value={settings.name}
          onChange={(text: string) => setSettings({ ...settings, name: text })}
        />
        <InputField
          label="Address"
          value={settings.address || ''}
          onChange={(text: string) => setSettings({ ...settings, address: text })}
        />
        <InputField
          label="Phone"
          value={settings.phone || ''}
          onChange={(text: string) => setSettings({ ...settings, phone: text })}
          keyboardType="phone-pad"
        />
        <InputField
          label="Email"
          value={settings.email || ''}
          onChange={(text: string) => setSettings({ ...settings, email: text })}
          keyboardType="email-address"
        />
      </Section>

      <Section title="Overtime Rules" icon="timer">
        <View style={styles.switchRow}>
          <Text style={styles.label}>Enable Overtime</Text>
          <Switch
            value={settings.overtime_enabled}
            onValueChange={(val: boolean) => setSettings({ ...settings, overtime_enabled: val })}
            trackColor={{ false: '#333', true: '#00D4FF' }}
            thumbColor={settings.overtime_enabled ? '#FFF' : '#888'}
          />
        </View>
        {settings.overtime_enabled && (
          <>
            <Text style={styles.label}>Overtime basis</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16}}>
              {([['daily','Daily'],['weekly','Weekly'],['daily_weekly','Daily + weekly']] as const).map(([mode,label])=>(
                <TouchableOpacity key={mode} accessibilityRole="radio" accessibilityState={{checked:settings.overtime_mode===mode}}
                  onPress={()=>setSettings({...settings,overtime_mode:mode})}
                  style={{padding:12,borderRadius:8,borderWidth:1,borderColor:settings.overtime_mode===mode?'#00D4FF':'#555'}}>
                  <Text style={{color:settings.overtime_mode===mode?'#00D4FF':'#FFF'}}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {settings.overtime_mode!=='weekly' && <InputFieldDecimal label="Daily overtime after (hours)" value={dailyStr} onChangeText={setDailyStr} placeholder="8 or 10"/>}
            {settings.overtime_mode!=='daily' && <InputFieldDecimal label="Weekly overtime after (hours)" value={thresholdStr} onChangeText={setThresholdStr} placeholder="40 or 44.5"/>}
            <InputFieldDecimal label="Overtime pay multiplier" value={multiplierStr} onChangeText={setMultiplierStr} placeholder="1.5"/>
            <Text style={styles.label}>Workweek starts on</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16}}>
              {days.map((day,index)=><TouchableOpacity key={day} accessibilityRole="radio" accessibilityLabel={day} accessibilityState={{checked:settings.overtime_week_start===index}} onPress={()=>setSettings({...settings,overtime_week_start:index})} style={{padding:10,borderRadius:8,backgroundColor:settings.overtime_week_start===index?'#164856':'#292929'}}><Text style={{color:'#FFF'}}>{day.slice(0,3)}</Text></TouchableOpacity>)}
            </View>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16}}>
              {([['daily',8],['daily',10],['weekly',40],['weekly',44.5]] as const).map(([mode,hours])=><TouchableOpacity key={mode+hours} onPress={()=>applyPreset(mode,hours)} style={{padding:10,borderWidth:1,borderColor:'#555',borderRadius:8}}><Text style={{color:'#00D4FF'}}>{mode==='daily'?'Daily':'Weekly'} {hours}h</Text></TouchableOpacity>)}
            </View>
          </>
        )}
        <InputField label="Company time zone (IANA)" value={settings.timezone} onChange={(timezone:string)=>setSettings({...settings,timezone})}/>
        <Text style={{color:'#CCC',lineHeight:21,marginBottom:12}}>{example}</Text>
        <Text style={{color:'#AAA',lineHeight:21}}>Combined mode uses the greater of daily or weekly overtime for each week, without counting an hour twice. 44.5 hours means 44 hours 30 minutes. Unpaid breaks are excluded; overnight breaks are allocated proportionally between days.</Text>
        <Text style={{color:'#AAA',lineHeight:21,marginTop:12}}>Changes apply to unlocked time and new payroll drafts. Previously approved entries whose pay changes return for manager review. Existing payroll stays unchanged. Use rules that meet applicable employment requirements.</Text>
      </Section>

      <Section title="Payroll & Branding" icon="palette">
        <InputFieldDecimal
          label="Default Hourly Rate ($)"
          value={hourlyRateStr}
          onChangeText={setHourlyRateStr}
          placeholder="e.g. 20.00"
        />
      </Section>


    </ScrollView>
  );
}

// ─── Reusable components ───
const Section = ({ title, icon, children }: any) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <MaterialIcons name={icon} size={22} color="#00D4FF" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionContent}>{children}</View>
  </View>
);

const InputField = ({
  label,
  value,
  onChange,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  keyboardType?: string;
}) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType as any}
      placeholderTextColor="#666"
    />
  </View>
);

const InputFieldDecimal = ({
  label,
  value,
  onChangeText,
  placeholder = '',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor="#666"
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', flex: 1, marginLeft: 16 },
  saveBtn: { color: '#00D4FF', fontSize: 16, fontWeight: '600' },
  logoSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  logo: { width: 100, height: 100, borderRadius: 50 },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  uploadBtnText: { color: '#00D4FF', fontSize: 14 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  sectionContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  field: { marginBottom: 12 },
  label: { color: '#AAA', fontSize: 13, marginBottom: 4 },
  input: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiSuggestionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9C27B0',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
  },
  aiSuggestionText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  insightCard: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  insightTitle: { color: '#888', fontSize: 12 },
  insightValue: { color: '#00D4FF', fontSize: 22, fontWeight: 'bold', marginVertical: 2 },
  insightSub: { color: '#888', fontSize: 12 },
});

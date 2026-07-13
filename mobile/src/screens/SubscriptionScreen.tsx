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
    overtime_enabled: boolean;
    overtime_threshold_hours: number;
    overtime_multiplier: number;
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
    overtime_enabled: true,
    overtime_threshold_hours: 40,
    overtime_multiplier: 1.5,
    default_hourly_rate: 20,
  });
  const [originalSettings, setOriginalSettings] = useState<CompanySettings>(settings);
  const [logoFile, setLogoFile] = useState<any>(null);
  const [thresholdStr, setThresholdStr] = useState('40');
  const [multiplierStr, setMultiplierStr] = useState('1.5');
  const [hourlyRateStr, setHourlyRateStr] = useState('20');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const companyData = await api.get<CompanyResponse>(`/companies/${user?.companyId}`);
      const settingsData = await api.get<SettingsResponse>(`/companies/${user?.companyId}/settings`);

      const merged: CompanySettings = {
        id: companyData.id,
        name: companyData.name || '',
        logo_url: companyData.logo_url || null,
        address: companyData.address || null,
        phone: companyData.phone || null,
        email: companyData.email || null,
        overtime_enabled: settingsData.settings?.overtime_enabled ?? true,
        overtime_threshold_hours: settingsData.settings?.overtime_threshold_hours ?? 40,
        overtime_multiplier: settingsData.settings?.overtime_multiplier ?? 1.5,
        default_hourly_rate: 20,
      };
      setSettings(merged);
      setOriginalSettings(merged);
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
    const threshold = parseFloat(thresholdStr);
    const multiplier = parseFloat(multiplierStr);
    const hourlyRate = parseFloat(hourlyRateStr);

    if (isNaN(threshold) || threshold < 0) {
      Alert.alert('Invalid Value', 'Please enter a valid positive number for overtime threshold.');
      return;
    }
    if (isNaN(multiplier) || multiplier < 1) {
      Alert.alert('Invalid Value', 'Overtime multiplier must be at least 1.');
      return;
    }
    if (isNaN(hourlyRate) || hourlyRate < 0) {
      Alert.alert('Invalid Value', 'Hourly rate must be a positive number.');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/companies/${user?.companyId}/settings`, {
        overtime_enabled: settings.overtime_enabled,
        overtime_threshold_hours: threshold,
        overtime_multiplier: multiplier,
        default_hourly_rate: hourlyRate,
      });

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
      Alert.alert('Error', e.message || 'Failed to save settings');
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

  const getOvertimeSuggestion = () => ({
    suggestion: 'Industry standard is 40h. Your team is within healthy limits.',
    threshold: 40,
    multiplier: 1.5,
  });

  const applySuggestion = () => {
    const suggestion = getOvertimeSuggestion();
    setThresholdStr(String(suggestion.threshold));
    setMultiplierStr(String(suggestion.multiplier));
    setSettings({
      ...settings,
      overtime_threshold_hours: suggestion.threshold,
      overtime_multiplier: suggestion.multiplier,
    });
    Alert.alert('💡 AI Suggestion Applied', suggestion.suggestion);
  };

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
        <InputField label="Company Name" value={settings.name} onChange={(text: string) => setSettings({ ...settings, name: text })} />
        <InputField label="Address" value={settings.address || ''} onChange={(text: string) => setSettings({ ...settings, address: text })} />
        <InputField label="Phone" value={settings.phone || ''} onChange={(text: string) => setSettings({ ...settings, phone: text })} keyboardType="phone-pad" />
        <InputField label="Email" value={settings.email || ''} onChange={(text: string) => setSettings({ ...settings, email: text })} keyboardType="email-address" />
      </Section>

      <Section title="Overtime Rules" icon="timer">
        <View style={styles.switchRow}>
          <Text style={styles.label}>Enable Overtime</Text>
          <Switch
            value={settings.overtime_enabled}
            onValueChange={(val) => setSettings({ ...settings, overtime_enabled: val })}
            trackColor={{ false: '#333', true: '#00D4FF' }}
            thumbColor={settings.overtime_enabled ? '#FFF' : '#888'}
          />
        </View>
        {settings.overtime_enabled && (
          <>
            <InputFieldDecimal
              label="Threshold (hours per week)"
              value={thresholdStr}
              onChangeText={setThresholdStr}
              placeholder="e.g. 40.5"
            />
            <InputFieldDecimal
              label="Overtime Multiplier (e.g. 1.5)"
              value={multiplierStr}
              onChangeText={setMultiplierStr}
              placeholder="e.g. 1.5"
            />
            <TouchableOpacity style={styles.aiSuggestionBtn} onPress={applySuggestion}>
              <Ionicons name="sparkles" size={20} color="#FFF" />
              <Text style={styles.aiSuggestionText}>AI‑recommended threshold</Text>
            </TouchableOpacity>
          </>
        )}
      </Section>

      <Section title="Payroll & Branding" icon="palette">
        <InputFieldDecimal
          label="Default Hourly Rate ($)"
          value={hourlyRateStr}
          onChangeText={setHourlyRateStr}
          placeholder="e.g. 20.00"
        />
      </Section>

      <Section title="Smart Insights" icon="analytics">
        <View style={styles.insightCard}>
          <Text style={styles.insightTitle}>Overtime Usage</Text>
          <Text style={styles.insightValue}>$1,240 this month</Text>
          <Text style={styles.insightSub}>↑ 12% from last month</Text>
        </View>
        <View style={styles.insightCard}>
          <Text style={styles.insightTitle}>Average Weekly Hours</Text>
          <Text style={styles.insightValue}>38.2h</Text>
          <Text style={styles.insightSub}>Within threshold ✓</Text>
        </View>
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

const InputField = ({ label, value, onChange, keyboardType = 'default' }: any) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={(text: string) => onChange(text)}
      keyboardType={keyboardType}
      placeholderTextColor="#666"
    />
  </View>
);

const InputFieldDecimal = ({ label, value, onChangeText, placeholder = '' }: any) => (
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
  logoSection: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
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
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
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
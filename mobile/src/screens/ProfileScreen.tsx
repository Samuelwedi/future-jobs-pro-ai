import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import type { Lang } from '../services/i18n';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const [tempUnit, setTempUnit] = useState<'celsius' | 'fahrenheit'>('celsius');

  useEffect(() => {
    api.get<{ success: boolean; temperature_unit: string }>(`/companies/${user?.companyId}/unit`)
      .then(res => setTempUnit(res.temperature_unit as any))
      .catch(() => {});
  }, []);

  const handleLanguageChange = async (newLang: Lang) => {
    await setLang(newLang);
    Alert.alert(t('language_changed'), t('language_changed'));
  };

  const handleUnitChange = async (unit: 'celsius' | 'fahrenheit') => {
    try {
      await api.put(`/companies/${user?.companyId}/temperature-unit`, { unit });
      setTempUnit(unit);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logout') + '?', [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <MaterialIcons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.firstName?.charAt(0).toUpperCase()}{user?.lastName?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.userName}>{user?.firstName} {user?.lastName}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{t(`role_${user?.role}`)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('language')}</Text>
      <View style={styles.languageRow}>
        {(['en','es','fr'] as Lang[]).map(l => (
          <TouchableOpacity key={l} style={[styles.langBtn, lang === l && styles.langBtnActive]} onPress={() => handleLanguageChange(l)}>
            <Text style={[styles.langBtnText, lang === l && styles.langBtnTextActive]}>{t(l === 'en' ? 'english' : l === 'es' ? 'spanish' : 'french')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Temperature Unit</Text>
      <View style={styles.languageRow}>
        <TouchableOpacity style={[styles.langBtn, tempUnit === 'celsius' && styles.langBtnActive]} onPress={() => handleUnitChange('celsius')}>
          <Text style={[styles.langBtnText, tempUnit === 'celsius' && styles.langBtnTextActive]}>°C</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.langBtn, tempUnit === 'fahrenheit' && styles.langBtnActive]} onPress={() => handleUnitChange('fahrenheit')}>
          <Text style={[styles.langBtnText, tempUnit === 'fahrenheit' && styles.langBtnTextActive]}>°F</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <MaterialIcons name="logout" size={20} color="#F44336" />
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Future Jobs Pro AI – Samuel B.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginBottom: 20 },
  userCard: { alignItems: 'center', marginBottom: 40 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00D4FF', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  avatarText: { color: '#0A0A0A', fontSize: 32, fontWeight: 'bold' },
  userName: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  userEmail: { color: '#888', fontSize: 14, marginTop: 4 },
  roleBadge: { marginTop: 10, backgroundColor: '#00D4FF20', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  roleText: { color: '#00D4FF', fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 16, marginTop: 20 },
  languageRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  langBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  langBtnActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  langBtnText: { color: '#888', fontSize: 15, fontWeight: '500' },
  langBtnTextActive: { color: '#0A0A0A', fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F4433640', marginTop: 10, marginBottom: 30 },
  logoutText: { color: '#F44336', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  footer: { color: '#555', fontSize: 12, textAlign: 'center' },
});
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  TextInput, Modal, ActivityIndicator, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';
import type { Lang } from '../services/i18n';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen() {
  const navigation = useNavigation<any>(); // ✅ use any to avoid navigation type errors
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const [tempUnit, setTempUnit] = useState<'celsius' | 'fahrenheit'>('celsius');
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [profilePic, setProfilePic] = useState((user as any)?.profilePic || null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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

  const pickProfilePic = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setUploading(true);
      try {
        const response = await api.uploadFileWithData<{ success: boolean; profilePic: string }>(
          '/users/profile-pic',
          uri,
          {},
          'photo'
        );
        setProfilePic(response.profilePic);
        (user as any).profilePic = response.profilePic;
        Alert.alert('Success', 'Profile picture updated');
      } catch (err) {
        Alert.alert('Error', 'Failed to upload profile picture');
      } finally {
        setUploading(false);
      }
    }
  };

  const saveName = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Error', 'First and last name are required');
      return;
    }
    setEditing(true);
    try {
      await api.put('/users/profile', { firstName: firstName.trim(), lastName: lastName.trim() });
      (user as any).firstName = firstName.trim();
      (user as any).lastName = lastName.trim();
      (user as any).fullName = `${firstName.trim()} ${lastName.trim()}`;
      setEditNameModalVisible(false);
      Alert.alert('Success', 'Name updated');
    } catch (err) {
      Alert.alert('Error', 'Failed to update name');
    } finally {
      setEditing(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'All fields are required');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      Alert.alert('Success', 'Password changed successfully');
      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <MaterialIcons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      <View style={styles.userCard}>
        <TouchableOpacity onPress={pickProfilePic} disabled={uploading}>
          <View style={styles.avatarContainer}>
            {profilePic ? (
              <Image source={{ uri: profilePic }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.firstName?.charAt(0).toUpperCase()}{user?.lastName?.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.cameraIcon}>
              <MaterialIcons name="photo-camera" size={16} color="#FFF" />
            </View>
          </View>
        </TouchableOpacity>
        <Text style={styles.userName}>{user?.firstName} {user?.lastName}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{t(`role_${user?.role}`)}</Text>
        </View>
        <TouchableOpacity style={styles.editNameBtn} onPress={() => setEditNameModalVisible(true)}>
          <MaterialIcons name="edit" size={16} color="#00D4FF" />
          <Text style={styles.editNameText}>Edit Name</Text>
        </TouchableOpacity>
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

      <TouchableOpacity style={styles.actionBtn} onPress={() => setPasswordModalVisible(true)}>
        <MaterialIcons name="lock-outline" size={20} color="#FFF" />
        <Text style={styles.actionText}>Change Password</Text>
      </TouchableOpacity>

      {/* ----- Subscription Button (boss/manager only) ----- */}
      {(user?.role === 'boss' || user?.role === 'manager') && (
        <TouchableOpacity style={[styles.actionBtn, { borderColor: '#00D4FF', marginTop: 8 }]} onPress={() => navigation.navigate('Subscription')}>
          <MaterialIcons name="stars" size={20} color="#00D4FF" />
          <Text style={[styles.actionText, { color: '#00D4FF' }]}>Subscription Plans</Text>
        </TouchableOpacity>
      )}

      {/* ----- Privacy Policy (required by Apple) ----- */}
      <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('WebView', { url: 'https://futurejobsproai.com/privacy', title: 'Privacy Policy' })}>
        <MaterialIcons name="privacy-tip" size={20} color="#00D4FF" />
        <Text style={[styles.actionText, { color: '#00D4FF' }]}>Privacy Policy</Text>
      </TouchableOpacity>

      {/* ----- Terms of Use (required by Apple) ----- */}
      <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('WebView', { url: 'https://futurejobsproai.com/terms', title: 'Terms of Use' })}>
        <MaterialIcons name="description" size={20} color="#00D4FF" />
        <Text style={[styles.actionText, { color: '#00D4FF' }]}>Terms of Use</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <MaterialIcons name="logout" size={20} color="#F44336" />
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>Future Jobs Pro AI – Samuel B.</Text>

      {/* Edit Name Modal */}
      <Modal visible={editNameModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.input}
              placeholder="First Name"
              placeholderTextColor="#888"
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              placeholderTextColor="#888"
              value={lastName}
              onChangeText={setLastName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setEditNameModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={saveName} disabled={editing}>
                <Text style={[styles.btnText, { color: '#0A0A0A' }]}>{editing ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Current Password"
              placeholderTextColor="#888"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="New Password (min 6 chars)"
              placeholderTextColor="#888"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm New Password"
              placeholderTextColor="#888"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setPasswordModalVisible(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={handleChangePassword} disabled={changingPassword}>
                <Text style={[styles.btnText, { color: '#0A0A0A' }]}>{changingPassword ? 'Changing...' : 'Update'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  backBtn: { marginBottom: 20 },
  userCard: { alignItems: 'center', marginBottom: 40 },
  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#00D4FF', justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarText: { color: '#0A0A0A', fontSize: 36, fontWeight: 'bold' },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#00D4FF',
    borderRadius: 15,
    padding: 6,
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  userName: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  userEmail: { color: '#888', fontSize: 14, marginTop: 4 },
  roleBadge: { marginTop: 10, backgroundColor: '#00D4FF20', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  roleText: { color: '#00D4FF', fontSize: 14, fontWeight: '600' },
  editNameBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  editNameText: { color: '#00D4FF', fontSize: 14, marginLeft: 4 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 16, marginTop: 20 },
  languageRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  langBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  langBtnActive: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  langBtnText: { color: '#888', fontSize: 15, fontWeight: '500' },
  langBtnTextActive: { color: '#0A0A0A', fontWeight: '600' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#333' },
  actionText: { color: '#FFF', fontSize: 16, marginLeft: 12 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F4433640', marginTop: 10, marginBottom: 30 },
  logoutText: { color: '#F44336', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  footer: { color: '#555', fontSize: 12, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: '#0A0A0A', borderRadius: 10, padding: 12, color: '#FFF', borderWidth: 1, borderColor: '#333', marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  btn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  cancelBtn: { borderWidth: 1, borderColor: '#888' },
  saveBtn: { backgroundColor: '#00D4FF' },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
});
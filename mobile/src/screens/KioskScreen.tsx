import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Vibration } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

export default function KioskScreen() {
  const navigation = useNavigation<any>();
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'clock-in' | 'clock-out'>('clock-in');
  const [message, setMessage] = useState('');
  const projectId = '65aba618-d0e8-424d-a7da-bb9b5cb06df3'; // Demo Project

  const handleKeyPress = (digit: string) => { if (pin.length < 6) setPin(prev => prev + digit); };
  const handleDelete = () => setPin(prev => prev.slice(0, -1));

  const handleAction = async () => {
    if (pin.length < 4) { Alert.alert('Error', 'Please enter your PIN'); return; }
    try {
      const endpoint = mode === 'clock-in' ? '/kiosk/clock-in' : '/kiosk/clock-out';
      const body: any = { pin, projectId };
      const res = await api.post<{ success: boolean; message: string }>(endpoint, body);
      Vibration.vibrate(200);
      setMessage(res.message);
      setPin('');
      setTimeout(() => setMessage(''), 3000);
    } catch (e: any) { Alert.alert('Error', e.message || 'Action failed'); setPin(''); }
  };

  const renderKey = (digit: string) => (
    <TouchableOpacity key={digit} style={styles.key} onPress={() => handleKeyPress(digit)}>
      <Text style={styles.keyText}>{digit}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <MaterialIcons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kiosk Clock</Text>
        <Text style={styles.headerSubtitle}>Enter your PIN to clock in or out</Text>
      </View>
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, mode === 'clock-in' && styles.modeBtnActiveIn]} onPress={() => { setMode('clock-in'); setPin(''); setMessage(''); }}>
          <Text style={[styles.modeText, mode === 'clock-in' && styles.modeTextActive]}>Clock In</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === 'clock-out' && styles.modeBtnActiveOut]} onPress={() => { setMode('clock-out'); setPin(''); setMessage(''); }}>
          <Text style={[styles.modeText, mode === 'clock-out' && styles.modeTextActive]}>Clock Out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.pinDisplay}>
        {[0,1,2,3,4,5].map(i => <View key={i} style={[styles.pinDot, pin.length > i && styles.pinDotFilled]} />)}
      </View>
      {message !== '' && <Text style={styles.message}>{message}</Text>}
      <View style={styles.keypad}>
        {['1','2','3','4','5','6','7','8','9'].map(renderKey)}
        <TouchableOpacity style={styles.key} onPress={handleDelete}><MaterialIcons name="backspace" size={28} color="#FFF" /></TouchableOpacity>
        {renderKey('0')}
        <TouchableOpacity style={[styles.key, styles.keyAction]} onPress={handleAction}>
          <MaterialIcons name={mode === 'clock-in' ? 'login' : 'logout'} size={28} color="#0A0A0A" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  backBtn: { position: 'absolute', top: 60, left: 20, zIndex: 10 },
  header: { alignItems: 'center', marginBottom: 30 },
  headerTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 8 },
  modeRow: { flexDirection: 'row', gap: 16, marginBottom: 30 },
  modeBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 25, borderWidth: 1, borderColor: '#333' },
  modeBtnActiveIn: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  modeBtnActiveOut: { backgroundColor: '#F44336', borderColor: '#F44336' },
  modeText: { color: '#888', fontSize: 16, fontWeight: '600' },
  modeTextActive: { color: '#FFF' },
  pinDisplay: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  pinDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#888' },
  pinDotFilled: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  message: { color: '#4CAF50', fontSize: 16, fontWeight: '600', marginBottom: 20 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 12, justifyContent: 'center' },
  key: { width: 80, height: 60, borderRadius: 14, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  keyAction: { backgroundColor: '#00D4FF', borderColor: '#00D4FF' },
  keyText: { color: '#FFF', fontSize: 24, fontWeight: '600' },
});
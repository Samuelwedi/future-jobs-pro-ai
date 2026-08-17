// ============================================
// LOGIN SCREEN
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function LoginScreen() {
  const { login } = useAuth();
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (error: any) {
      console.error('❌ Login error:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      Alert.alert('Login Failed', error.response?.data?.message || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="light" />
      <LinearGradient colors={['#07111F', '#0A0A0A', '#071827']} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <MaterialIcons name="auto-awesome" size={32} color="#07111F" />
        </View>
        <Text style={styles.eyebrow}>FIELD OPERATIONS, UNIFIED</Text>
        <Text style={styles.title}>Future Jobs Pro AI</Text>
        <Text style={styles.subtitle}>Run the field, protect the work, and pay your team from one command center.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#888"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.demoButton} onPress={() => navigation.navigate('Demo')} disabled={isLoading}>
          <MaterialIcons name="play-circle-outline" size={22} color="#67E8F9" />
          <Text style={styles.demoButtonText}>Explore the interactive demo</Text>
        </TouchableOpacity>
        <View style={styles.trustRow}>
          <Text style={styles.trustText}>GPS evidence</Text>
          <Text style={styles.trustDot}>•</Text>
          <Text style={styles.trustText}>AI assistance</Text>
          <Text style={styles.trustDot}>•</Text>
          <Text style={styles.trustText}>Payroll ready</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brandMark: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#67E8F9', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 22, shadowColor: '#22D3EE', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  eyebrow: { fontSize: 11, letterSpacing: 2.2, fontWeight: '800', color: '#67E8F9', textAlign: 'center', marginBottom: 10 },
  title: { fontSize: 34, fontWeight: '900', color: '#FFF', textAlign: 'center', letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 22, color: '#A8B5C7', textAlign: 'center', marginTop: 10, marginBottom: 32 },
  input: {
    backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, fontSize: 16,
    color: '#FFF', borderWidth: 1, borderColor: '#333', marginBottom: 12,
  },
  button: {
    backgroundColor: '#00D4FF', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
  demoButton: { borderRadius: 12, padding: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 12, borderWidth: 1, borderColor: '#164E63', backgroundColor: '#082F49' },
  demoButtonText: { color: '#CFFAFE', fontSize: 15, fontWeight: '700' },
  trustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 24, gap: 7 },
  trustText: { color: '#64748B', fontSize: 11 },
  trustDot: { color: '#22D3EE', fontSize: 12 },
});

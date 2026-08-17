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
import { API_URL } from '../services/api';

export default function LoginScreen() {
  const { login } = useAuth();
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
      console.log('🔍 Login attempt with email:', email);
      console.log('🔍 Login URL:', API_URL + '/auth/login');

      const response = await login(email, password);
      console.log('✅ Login response:', response);
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
      <View style={styles.content}>
        <Text style={styles.title}>Future Jobs Pro AI</Text>
        <Text style={styles.subtitle}>Samuel B.</Text>

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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFF', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#00D4FF', textAlign: 'center', marginBottom: 32 },
  input: {
    backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, fontSize: 16,
    color: '#FFF', borderWidth: 1, borderColor: '#333', marginBottom: 12,
  },
  button: {
    backgroundColor: '#00D4FF', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
});
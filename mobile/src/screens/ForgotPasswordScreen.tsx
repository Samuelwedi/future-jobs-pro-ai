import React, { useState } from 'react';
import { ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const safeInsets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) return Alert.alert('Invalid email', 'Enter the email address used for your account.');
    setLoading(true);
    try { const response = await api.post<{ message: string }>('/auth/forgot-password', { email: normalized }); Alert.alert('Check your email', response.message, [{ text: 'OK', onPress: () => navigation.goBack() }]); }
    catch (error: any) { Alert.alert('Could not send link', error.response?.data?.message || 'Try again later.'); }
    finally { setLoading(false); }
  };
  return <SafeAreaView edges={[]} style={styles.safe}><KeyboardAvoidingView keyboardVerticalOffset={safeInsets.top} style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Text style={styles.title}>Reset your password</Text><Text style={styles.subtitle}>Enter the email used to sign in. We’ll send a secure link that expires in one hour.</Text>
    <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#718096" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" onSubmitEditing={submit} />
    <TouchableOpacity style={styles.primary} onPress={submit} disabled={loading}>{loading ? <ActivityIndicator color="#07111F" /> : <Text style={styles.primaryText}>Send Reset Link</Text>}</TouchableOpacity>
    <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()} disabled={loading}><Text style={styles.linkText}>Back to Sign In</Text></TouchableOpacity>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#07111F' }, content: { flexGrow: 1, justifyContent: 'center', padding: 24 }, title: { color: '#FFF', fontSize: 30, fontWeight: '900', textAlign: 'center' }, subtitle: { color: '#A8B5C7', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, marginBottom: 28 }, input: { backgroundColor: '#111D2A', borderColor: '#294052', borderWidth: 1, borderRadius: 12, color: '#FFF', fontSize: 16, padding: 16 }, primary: { backgroundColor: '#00D4FF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 14 }, primaryText: { color: '#07111F', fontSize: 16, fontWeight: '800' }, link: { padding: 16, alignItems: 'center' }, linkText: { color: '#67E8F9', fontWeight: '700' } });

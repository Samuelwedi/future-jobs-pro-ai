import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const safeInsets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { register } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async () => {
    const email = form.email.trim().toLowerCase();
    if (!form.firstName.trim() || !form.lastName.trim()) return Alert.alert('Name required', 'Enter your first and last name.');
    if (!EMAIL_PATTERN.test(email)) return Alert.alert('Invalid email', 'Enter a valid email address.');
    if (form.password.length < 8) return Alert.alert('Password too short', 'Use at least 8 characters.');
    if (form.password !== form.confirmPassword) return Alert.alert('Passwords do not match', 'Re-enter the same password.');
    setLoading(true);
    try { await register({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email, password: form.password }); }
    catch (error: any) { Alert.alert('Sign up failed', error.response?.data?.message || 'Could not create your account.'); }
    finally { setLoading(false); }
  };
  return <SafeAreaView edges={[]} style={styles.safe}><KeyboardAvoidingView keyboardVerticalOffset={safeInsets.top} style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Create your account</Text><Text style={styles.subtitle}>Start using Future Jobs Pro AI</Text>
    <View style={styles.row}><TextInput style={[styles.input, styles.half]} placeholder="First name" placeholderTextColor="#718096" value={form.firstName} onChangeText={v => update('firstName', v)} textContentType="givenName" /><TextInput style={[styles.input, styles.half]} placeholder="Last name" placeholderTextColor="#718096" value={form.lastName} onChangeText={v => update('lastName', v)} textContentType="familyName" /></View>
    <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#718096" value={form.email} onChangeText={v => update('email', v)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
    <TextInput style={styles.input} placeholder="Password (8+ characters)" placeholderTextColor="#718096" value={form.password} onChangeText={v => update('password', v)} secureTextEntry textContentType="newPassword" />
    <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor="#718096" value={form.confirmPassword} onChangeText={v => update('confirmPassword', v)} secureTextEntry textContentType="newPassword" onSubmitEditing={submit} />
    <TouchableOpacity style={styles.primary} onPress={submit} disabled={loading}>{loading ? <ActivityIndicator color="#07111F" /> : <Text style={styles.primaryText}>Sign Up</Text>}</TouchableOpacity>
    <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()} disabled={loading}><Text style={styles.linkText}>Already have an account? Sign In</Text></TouchableOpacity>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#07111F' }, content: { flexGrow: 1, justifyContent: 'center', padding: 24 }, title: { color: '#FFF', fontSize: 30, fontWeight: '900', textAlign: 'center' }, subtitle: { color: '#A8B5C7', textAlign: 'center', marginTop: 8, marginBottom: 28 }, row: { flexDirection: 'row', gap: 10 }, half: { flex: 1 }, input: { backgroundColor: '#111D2A', borderColor: '#294052', borderWidth: 1, borderRadius: 12, color: '#FFF', fontSize: 16, padding: 16, marginBottom: 12 }, primary: { backgroundColor: '#00D4FF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 6 }, primaryText: { color: '#07111F', fontSize: 16, fontWeight: '800' }, link: { padding: 16, alignItems: 'center' }, linkText: { color: '#67E8F9', fontWeight: '700' } });

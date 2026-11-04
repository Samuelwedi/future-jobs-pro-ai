import { useLang } from '../context/LanguageContext';
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { API_URL } from '../services/api';
import { useNavigation } from '@react-navigation/native';

export default function ContactScreen() {
  const { t } = useLang();
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);

  const handleSend = async () => {
    if (sendLock.current) return;
    if (!name.trim() || !email.trim() || !message.trim()) {
      Alert.alert(t('Missing fields'), t('Please fill out all fields.'));
      return;
    }
    sendLock.current = true;
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/contact`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email,message})});
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.message || 'Delivery could not be confirmed.');
      Alert.alert(t('Message accepted'), t('Your message was accepted for delivery to support.'));
      setName(''); setEmail(''); setMessage('');
    } catch (error: any) {
      Alert.alert(t('Message not confirmed'), error.message || 'Your text has been kept. Please try again later.');
    } finally { sendLock.current = false; setSending(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("Contact Us")}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" style={styles.body}>
        <Text style={styles.label}>{t("Full Name")}</Text>
        <TextInput style={styles.input} placeholder={t("Your name")} placeholderTextColor="#888" value={name} onChangeText={setName} maxLength={200} editable={!sending} />
        <Text style={styles.label}>{t("Email")}</Text>
        <TextInput style={styles.input} placeholder="your@email.com" placeholderTextColor="#888" keyboardType="email-address" value={email} onChangeText={setEmail} maxLength={254} editable={!sending} autoCapitalize="none" />
        <Text style={styles.label}>{t("Message")}</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder={t("How can we help?")} placeholderTextColor="#888" multiline numberOfLines={5} value={message} onChangeText={setMessage} maxLength={5000} editable={!sending} />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
          <Text style={styles.sendBtnText}>{sending ? t('Sending…') : t('Send Message')}</Text>
        </TouchableOpacity>

        <View style={styles.contactInfo}>
          <Text style={styles.sectionTitle}>{t("Other ways to reach us")}</Text>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:support@futurejobsproai.com')}>
            <Text style={styles.link}>📧 support@futurejobsproai.com</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  body: { flex: 1, padding: 20 },
  label: { color: '#888', fontSize: 14, marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: '#1A1A1A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', fontSize: 16, borderWidth: 1, borderColor: '#333' },
  multiline: { height: 120, textAlignVertical: 'top' },
  sendBtn: { backgroundColor: '#00D4FF', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  sendBtnText: { color: '#0A0A0A', fontWeight: '600', fontSize: 16 },
  contactInfo: { marginTop: 40 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  link: { color: '#00D4FF', fontSize: 15, marginBottom: 8 },
});
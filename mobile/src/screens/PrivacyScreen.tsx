import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function PrivacyScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.body}>
        {[
          { title: '1. Information We Collect', text: 'We collect account information (name, email), payment information (processed securely by Stripe), GPS location data (only during work hours), job site photos, voice notes, and usage data.' },
          { title: '2. How We Use It', text: 'We use your data to provide and improve our Service, process payments, generate work verification evidence, and send important updates.' },
          { title: '3. Location Data', text: 'GPS tracking is ONLY active when an employee is clocked in. It stops automatically when they clock out. Employees can see when tracking is active via a visible indicator.' },
          { title: '4. Data Sharing', text: 'We do NOT sell your personal data. We share data only within your company (boss/manager can view employee data) and with service providers (Stripe, OpenAI, cloud storage).' },
          { title: '5. Data Security', text: 'We use AES‑256 encryption at rest, TLS 1.3 in transit, secure API authentication, and regular security audits.' },
          { title: '6. Data Retention', text: 'Account information is retained until deletion. Time entries, GPS data, and job photos are retained for 7 years for legal/compliance purposes.' },
          { title: '7. Your Rights', text: 'You have the right to access, correct, delete, and export your personal data. You may opt out of marketing emails at any time.' },
          { title: '8. Contact', text: 'For privacy questions: support@futurejobsproai.com' },
        ].map((section, idx) => (
          <View key={idx} style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.paragraph}>{section.text}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  body: { flex: 1, padding: 20 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  paragraph: { color: '#AAA', fontSize: 14, lineHeight: 22 },
});
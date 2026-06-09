import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function TermsScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.body}>
        {[
          { title: '1. Acceptance', text: 'By using Future Jobs Pro AI, you agree to these Terms. If you do not agree, do not use our Service.' },
          { title: '2. Account', text: 'You must provide accurate information when creating an account. You are responsible for maintaining the security of your credentials.' },
          { title: '3. Subscription', text: 'Paid plans are billed monthly or annually. Fees are non‑refundable except as required by law.' },
          { title: '4. Acceptable Use', text: 'You agree not to use the Service for any illegal purpose or to interfere with our systems.' },
          { title: '5. Data & Privacy', text: 'Your use is subject to our Privacy Policy. You retain ownership of your data. We never sell your personal data.' },
          { title: '6. GPS & Location', text: 'Location data is collected only during active work hours. It stops when the employee clocks out.' },
          { title: '7. Limitation of Liability', text: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, FUTURE JOBS PRO AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.' },
          { title: '8. Termination', text: 'We may suspend or terminate your account for violation of these Terms. You may cancel at any time.' },
          { title: '9. Changes', text: 'We may modify these Terms. We will notify you of material changes via email or through the Service.' },
          { title: '10. Contact', text: 'For questions, contact: support@futurejobsproai.com' },
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
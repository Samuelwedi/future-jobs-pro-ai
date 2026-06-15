import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

export default function TermsScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.text}>
          By using Future Jobs Pro AI, you agree to be bound by these Terms of Service.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.text}>
          Future Jobs Pro AI provides workforce management tools including time tracking, GPS location, photo documentation, AI assistant, and scheduling.
        </Text>

        <Text style={styles.sectionTitle}>3. User Accounts</Text>
        <Text style={styles.text}>
          You must provide accurate information when creating an account. You are responsible for maintaining the confidentiality of your password.
        </Text>

        <Text style={styles.sectionTitle}>4. Data Collection</Text>
        <Text style={styles.text}>
          We collect location data (only during work hours), photos, voice notes, and basic profile information. See our Privacy Policy for details.
        </Text>

        <Text style={styles.sectionTitle}>5. Subscription Payments</Text>
        <Text style={styles.text}>
          If you choose a paid plan, you agree to pay the applicable fees. Subscriptions renew automatically unless cancelled.
        </Text>

        <Text style={styles.sectionTitle}>6. Termination</Text>
        <Text style={styles.text}>
          We may terminate or suspend your account if you violate these terms.
        </Text>

        <Text style={styles.sectionTitle}>7. Limitation of Liability</Text>
        <Text style={styles.text}>
          Future Jobs Pro AI is provided "as is". We are not liable for any damages arising from your use of the app.
        </Text>

        <Text style={styles.sectionTitle}>8. Changes to Terms</Text>
        <Text style={styles.text}>
          We may update these terms from time to time. Continued use of the app constitutes acceptance of the new terms.
        </Text>

        <Text style={styles.sectionTitle}>9. Contact</Text>
        <Text style={styles.text}>
          For questions, email support@futurejobsproai.com.
        </Text>

        <Text style={styles.effective}>Effective date: June 1, 2026</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: { padding: 8, marginLeft: 4 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { color: '#00D4FF', fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 8 },
  text: { color: '#CCC', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  effective: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 30 },
});
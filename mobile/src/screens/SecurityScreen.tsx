import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function SecurityScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.body}>
        {[
          { title: 'Encryption', desc: 'All data is encrypted at rest using AES‑256 and in transit using TLS 1.3.' },
          { title: 'Secure Cloud', desc: 'Your data is stored in secure, SOC‑2 compliant cloud infrastructure.' },
          { title: 'Access Control', desc: 'Role‑based access ensures that only authorised users can view sensitive data.' },
          { title: 'Compliance', desc: 'We adhere to industry best practices and comply with GDPR and CCPA regulations.' },
        ].map((item, idx) => (
          <View key={idx} style={{ marginBottom: 24 }}>
            <Text style={styles.sectionTitle}>{item.title}</Text>
            <Text style={styles.paragraph}>{item.desc}</Text>
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
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  paragraph: { color: '#AAA', fontSize: 15, lineHeight: 22 },
});
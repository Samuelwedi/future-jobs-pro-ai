import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function AboutScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.appName}>🚀 Future Jobs Pro AI</Text>
        <Text style={styles.version}>Version 1.0.0</Text>
        <Text style={styles.paragraph}>
          Future Jobs Pro AI was created by Samuel B. to help field service businesses protect their revenue with AI‑powered photo compliance, GPS tracking, and automatic dispute evidence.
        </Text>
        <Text style={styles.paragraph}>
          Built with React Native, Node.js, PostgreSQL, and OpenAI. All data is encrypted at rest and in transit.
        </Text>
        <Text style={styles.paragraph}>
          For support, contact support@futurejobsproai.com
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  body: { flex: 1, padding: 20 },
  appName: { color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  version: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  paragraph: { color: '#AAA', fontSize: 15, lineHeight: 22, marginBottom: 16 },
});
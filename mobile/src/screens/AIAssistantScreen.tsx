import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function AIAssistantScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Ionicons name="mic-circle-outline" size={80} color="#00D4FF" />
      <Text style={styles.title}>Lucy Voice Assistant</Text>
      <Text style={styles.subtitle}>
        Hands‑free AI for the jobsite. Clock in, take photos, or pull up a timesheet just by speaking.
      </Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>🚀 Coming Soon</Text>
      </View>
      <Text style={styles.note}>
        We're putting the finishing touches on Lucy. You’ll be the first to know when she’s live.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 24,
  },
  subtitle: {
    color: '#AAA',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 12,
  },
  badge: {
    backgroundColor: '#00D4FF20',
    borderColor: '#00D4FF',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 24,
  },
  badgeText: {
    color: '#00D4FF',
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
  button: {
    marginTop: 32,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
  },
});
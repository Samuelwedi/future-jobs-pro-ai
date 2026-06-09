import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function ContactScreen() {
  const navigation = useNavigation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (!name || !email || !message) {
      Alert.alert('Missing fields', 'Please fill out all fields.');
      return;
    }
    Alert.alert('Thank you!', 'Your message has been sent. We’ll get back to you shortly.');
    setName(''); setEmail(''); setMessage('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput style={styles.input} placeholder="Your name" placeholderTextColor="#888" value={name} onChangeText={setName} />
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="your@email.com" placeholderTextColor="#888" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Text style={styles.label}>Message</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="How can we help?" placeholderTextColor="#888" multiline numberOfLines={5} value={message} onChangeText={setMessage} />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendBtnText}>Send Message</Text>
        </TouchableOpacity>

        <View style={styles.contactInfo}>
          <Text style={styles.sectionTitle}>Other ways to reach us</Text>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:support@futurejobsproai.com')}>
            <Text style={styles.link}>📧 support@futurejobsproai.com</Text>
          </TouchableOpacity>
          <Text style={styles.link}>📞 +1 (888) 555-0123</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
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
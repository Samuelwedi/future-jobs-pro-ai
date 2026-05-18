import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>👤 Profile</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  email: { color: '#888', fontSize: 16, marginTop: 8 },
  logoutButton: { marginTop: 32, backgroundColor: '#F44336', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  logoutText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
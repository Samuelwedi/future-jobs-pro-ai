import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function CameraView() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>📸 Camera Screen</Text>
      <Text style={styles.subtitle}>Camera will load here</Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Take Photo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: '#888', fontSize: 16, marginTop: 8, marginBottom: 24 },
  button: { backgroundColor: '#00D4FF', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
});
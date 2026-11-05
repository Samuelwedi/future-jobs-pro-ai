import { useLang } from '../context/LanguageContext';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function SecurityScreen() {
 const {t,lang}=useLang();
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("Security")}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.body}>
        {[
          { title: 'Protect your account', desc: 'Use a unique password and keep your sign-in details private. Never share passwords or API keys in chat or support requests.' },
          { title: 'Shared devices', desc: 'Sign out when you finish using a shared device. Keep your device software and the app up to date.' },
          { title: 'Company access', desc: 'Ask your company administrator to review your role if you cannot access a feature. Administrators should review team access when responsibilities change.' },
          { title: 'Report a concern', desc: 'Use Support to report unexpected account activity. Include what happened and when, without sharing passwords, payment details or other sensitive information.' },
        ].map((item, idx) => (
          <View key={idx} style={{ marginBottom: 24 }}>
            <Text style={styles.sectionTitle}>{t(item.title)}</Text>
            <Text style={styles.paragraph}>{t(item.desc)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  body: { flex: 1, padding: 20 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  paragraph: { color: '#AAA', fontSize: 15, lineHeight: 22 },
});
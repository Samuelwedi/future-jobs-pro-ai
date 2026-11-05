import { useLang } from '../context/LanguageContext';
import React from 'react';
import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function AboutScreen() {
  const {t}=useLang();
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("About")}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.appName}>🚀 Future Jobs Pro AI</Text>
        <Text style={styles.version}>{t('Version {version} · Build {build}',{version:nativeApplicationVersion || t('Unknown'),build:nativeBuildVersion || t('Unknown')})}</Text>
        <Text style={styles.paragraph}>{t('Future Jobs Pro AI helps teams manage time, projects, payroll preparation and field evidence.')}</Text>
        <Text style={styles.paragraph}>{t('Review captured information before using it for payroll or a dispute.')}</Text>
        <Text style={styles.paragraph}>{t('For support, contact support@futurejobsproai.com')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold', marginLeft: 16 },
  body: { flex: 1, padding: 20 },
  appName: { color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  version: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  paragraph: { color: '#AAA', fontSize: 15, lineHeight: 22, marginBottom: 16 },
});
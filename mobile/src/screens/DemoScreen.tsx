import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

type DemoMode = 'command' | 'evidence' | 'payroll';

const demoData: Record<DemoMode, { title: string; subtitle: string; metrics: Array<[string, string]>; activity: string[] }> = {
  command: {
    title: 'Live operations command center',
    subtitle: 'See crews, shifts, jobs, and exceptions without chasing updates.',
    metrics: [['12', 'Crew active'], ['4', 'Jobs live'], ['98%', 'On schedule']],
    activity: ['Main Street crew clocked in', 'Lucy flagged a schedule conflict', 'Site photo verified at 9:42 AM'],
  },
  evidence: {
    title: 'Evidence that tells the whole story',
    subtitle: 'Combine time, GPS, photos, video, and voice notes into one defensible package.',
    metrics: [['46', 'GPS points'], ['8', 'Media files'], ['100%', 'Chain complete']],
    activity: ['GPS trail sealed', 'Voice note transcript attached', 'Evidence package ready to export'],
  },
  payroll: {
    title: 'From approved time to payroll',
    subtitle: 'Review hours, exceptions, vacation rules, and payroll readiness in one flow.',
    metrics: [['318h', 'Approved'], ['$0', 'Exceptions'], ['Fri', 'Next payroll']],
    activity: ['Overtime policy applied', 'Manager approval recorded', 'Payroll preview ready'],
  },
};

export default function DemoScreen() {
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<DemoMode>('command');
  const current = useMemo(() => demoData[mode], [mode]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#071827', '#050A12', '#0A0A0A']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <MaterialIcons name="arrow-back" size={23} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Product tour</Text>
          <Text style={styles.headerMeta}>No account required</Text>
        </View>
        <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>DEMO</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>FUTURE JOBS PRO AI</Text>
        <Text style={styles.heroTitle}>One operating system for every job.</Text>
        <Text style={styles.heroSubtitle}>Tap through a guided preview built from realistic field workflows.</Text>

        <View style={styles.tabs}>
          {([
            ['command', 'Command', 'dashboard'],
            ['evidence', 'Evidence', 'verified'],
            ['payroll', 'Payroll', 'payments'],
          ] as Array<[DemoMode, string, keyof typeof MaterialIcons.glyphMap]>).map(([key, label, icon]) => (
            <TouchableOpacity key={key} onPress={() => setMode(key)} style={[styles.tab, mode === key && styles.tabActive]}>
              <MaterialIcons name={icon} size={18} color={mode === key ? '#07111F' : '#94A3B8'} />
              <Text style={[styles.tabText, mode === key && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <LinearGradient colors={['#0E7490', '#155E75', '#0F172A']} style={styles.previewCard}>
          <View style={styles.previewTopRow}>
            <View style={styles.previewIcon}><MaterialIcons name="auto-awesome" size={24} color="#67E8F9" /></View>
            <Text style={styles.previewLabel}>LIVE WORKSPACE PREVIEW</Text>
          </View>
          <Text style={styles.previewTitle}>{current.title}</Text>
          <Text style={styles.previewSubtitle}>{current.subtitle}</Text>
          <View style={styles.metrics}>
            {current.metrics.map(([value, label]) => (
              <View key={label} style={styles.metric}>
                <Text style={styles.metricValue}>{value}</Text>
                <Text style={styles.metricLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.activityCard}>
          <Text style={styles.sectionTitle}>What just happened</Text>
          {current.activity.map((item, index) => (
            <View key={item} style={styles.activityRow}>
              <View style={styles.activityNumber}><Text style={styles.activityNumberText}>{index + 1}</Text></View>
              <Text style={styles.activityText}>{item}</Text>
              <MaterialIcons name="check-circle" size={20} color="#34D399" />
            </View>
          ))}
        </View>

        <View style={styles.lucyCard}>
          <View style={styles.lucyOrb}><MaterialIcons name="graphic-eq" size={28} color="#07111F" /></View>
          <View style={styles.lucyCopy}>
            <Text style={styles.lucyTitle}>Lucy connects the workflow</Text>
            <Text style={styles.lucyText}>Ask for a status, create work, find risk, or prepare an approval—with confirmation before sensitive actions.</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.signInButton} onPress={() => navigation.goBack()}>
          <Text style={styles.signInText}>Return to sign in</Text>
          <MaterialIcons name="arrow-forward" size={20} color="#07111F" />
        </TouchableOpacity>
        <Text style={styles.disclaimer}>Preview data is illustrative. No customer information is displayed.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050A12' },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#173047' },
  iconButton: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111C2B' },
  headerCopy: { flex: 1, marginLeft: 12 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  headerMeta: { color: '#7C8EA5', fontSize: 11, marginTop: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: '#082F49' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22D3EE' },
  liveText: { color: '#A5F3FC', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: { color: '#22D3EE', fontSize: 11, letterSpacing: 2, fontWeight: '900', marginTop: 8 },
  heroTitle: { color: '#FFF', fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -0.8, marginTop: 10 },
  heroSubtitle: { color: '#9AA9BC', fontSize: 15, lineHeight: 22, marginTop: 10 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: '#0D1724', marginTop: 24, borderWidth: 1, borderColor: '#17283A' },
  tab: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12 },
  tabActive: { backgroundColor: '#67E8F9' },
  tabText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#07111F' },
  previewCard: { marginTop: 18, borderRadius: 24, padding: 22, overflow: 'hidden' },
  previewTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#083344', alignItems: 'center', justifyContent: 'center' },
  previewLabel: { color: '#A5F3FC', fontSize: 10, letterSpacing: 1.3, fontWeight: '900' },
  previewTitle: { color: '#FFF', fontSize: 24, lineHeight: 29, fontWeight: '900', marginTop: 18 },
  previewSubtitle: { color: '#C8E7EF', fontSize: 14, lineHeight: 21, marginTop: 8 },
  metrics: { flexDirection: 'row', marginTop: 22, gap: 8 },
  metric: { flex: 1, backgroundColor: '#07182799', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#67E8F933' },
  metricValue: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  metricLabel: { color: '#A5F3FC', fontSize: 9, marginTop: 4 },
  activityCard: { marginTop: 18, backgroundColor: '#0D1724', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#17283A' },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  activityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#182536' },
  activityNumber: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#13263A', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  activityNumberText: { color: '#67E8F9', fontSize: 11, fontWeight: '900' },
  activityText: { color: '#C5D0DD', fontSize: 13, flex: 1 },
  lucyCard: { flexDirection: 'row', alignItems: 'center', marginTop: 18, padding: 18, borderRadius: 20, backgroundColor: '#17112B', borderWidth: 1, borderColor: '#4C1D95' },
  lucyOrb: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#C4B5FD', alignItems: 'center', justifyContent: 'center' },
  lucyCopy: { flex: 1, marginLeft: 14 },
  lucyTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  lucyText: { color: '#B8ADCE', fontSize: 12, lineHeight: 18, marginTop: 4 },
  signInButton: { marginTop: 22, padding: 16, borderRadius: 14, backgroundColor: '#67E8F9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  signInText: { color: '#07111F', fontSize: 15, fontWeight: '900' },
  disclaimer: { color: '#64748B', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 14 },
});

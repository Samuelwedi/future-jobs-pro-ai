import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

const actions = [
  { icon: 'camera-outline', label: 'Photo evidence', color: '#6FE7FF' },
  { icon: 'location-outline', label: 'GPS trail', color: '#42E8A7' },
  { icon: 'mic-outline', label: 'Voice notes', color: '#C49BFF' },
  { icon: 'calendar-outline', label: 'Schedule', color: '#FFBE68' },
] as const;

export default function DemoScreen() {
  const navigation = useNavigation<any>();

  return (
    <LinearGradient colors={['#06101D', '#0B1B31', '#08111E']} style={styles.background}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#EAFBFF" />
          </TouchableOpacity>
          <View style={styles.demoPill}>
            <View style={styles.demoDot} />
            <Text style={styles.demoPillText}>READ-ONLY DEMO</Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>FIELD COMMAND CENTER</Text>
        <Text style={styles.title}>See the whole workday, clearly.</Text>
        <Text style={styles.subtitle}>A guided sample workspace. Nothing here changes real data.</Text>

        <LinearGradient colors={['#163455', '#10253D']} style={styles.shiftCard}>
          <View style={styles.shiftHeader}>
            <View>
              <Text style={styles.cardEyebrow}>ACTIVE SHIFT</Text>
              <Text style={styles.projectName}>Riverside Office Fit-out</Text>
              <Text style={styles.projectMeta}>Crew 3 · Main floor · Calgary</Text>
            </View>
            <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>LIVE</Text></View>
          </View>
          <Text style={styles.timer}>04:18:32</Text>
          <View style={styles.signalRow}>
            <Signal icon="location" label="GPS verified" />
            <Signal icon="shield-checkmark" label="Evidence secured" />
          </View>
        </LinearGradient>

        <View style={styles.metricRow}>
          <Metric value="12" label="Crew on shift" accent="#42E8A7" />
          <Metric value="6" label="Active jobs" accent="#6FE7FF" />
          <Metric value="98%" label="Compliance" accent="#C49BFF" />
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>CAPTURE FROM THE FIELD</Text>
            <Text style={styles.sectionTitle}>One tap to document the job</Text>
          </View>
          <MaterialIcons name="verified-user" size={24} color="#42E8A7" />
        </View>
        <View style={styles.actionGrid}>
          {actions.map((action) => (
            <View key={action.label} style={styles.actionCard}>
              <View style={[styles.actionIcon, { backgroundColor: `${action.color}18` }]}>
                <Ionicons name={action.icon} size={23} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </View>
          ))}
        </View>

        <LinearGradient colors={['rgba(196,155,255,0.18)', 'rgba(111,231,255,0.08)']} style={styles.lucyCard}>
          <View style={styles.lucyMark}><Ionicons name="sparkles" size={23} color="#E9D8FF" /></View>
          <View style={styles.lucyCopy}>
            <Text style={styles.lucyTitle}>Lucy found something useful</Text>
            <Text style={styles.lucyText}>The west entrance photo is missing. Capture it before the crew closes today’s shift.</Text>
          </View>
        </LinearGradient>

        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.86}>
          <LinearGradient colors={['#6FE7FF', '#2B9CFF']} style={styles.cta}>
            <Text style={styles.ctaText}>Sign in to your workspace</Text>
            <Ionicons name="arrow-forward" size={19} color="#06101D" />
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.disclaimer}>Sample names and figures are illustrative. Demo mode has no API or account access.</Text>
      </ScrollView>
    </LinearGradient>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent: string }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, { color: accent }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Signal({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  return <View style={styles.signal}><Ionicons name={icon} size={14} color="#8EF5C8" /><Text style={styles.signalText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 38 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#10253D', borderWidth: 1, borderColor: '#29435F', alignItems: 'center', justifyContent: 'center' },
  demoPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(66,232,167,0.10)', borderWidth: 1, borderColor: 'rgba(66,232,167,0.24)' },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#42E8A7' },
  demoPillText: { color: '#8EF5C8', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  eyebrow: { color: '#6FE7FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.6, marginTop: 30 },
  title: { color: '#FFFFFF', fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -1.1, marginTop: 9, maxWidth: 340 },
  subtitle: { color: '#9DACBF', fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 22 },
  shiftCard: { borderRadius: 25, padding: 20, borderWidth: 1, borderColor: 'rgba(111,231,255,0.22)' },
  shiftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardEyebrow: { color: '#8BA2BA', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  projectName: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 6 },
  projectMeta: { color: '#93A6B9', fontSize: 11, marginTop: 4 },
  liveBadge: { backgroundColor: 'rgba(66,232,167,0.14)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  liveBadgeText: { color: '#8EF5C8', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  timer: { color: '#FFFFFF', fontSize: 38, fontWeight: '800', letterSpacing: 1, fontVariant: ['tabular-nums'], marginTop: 26 },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 17 },
  signal: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(5,15,25,0.38)' },
  signalText: { color: '#B8C8D8', fontSize: 10, fontWeight: '700' },
  metricRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  metric: { flex: 1, minHeight: 86, backgroundColor: '#0E1E32', borderRadius: 18, borderWidth: 1, borderColor: '#223B55', padding: 12, justifyContent: 'center' },
  metricValue: { fontSize: 22, fontWeight: '900' },
  metricLabel: { color: '#8498AD', fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 27, marginBottom: 13 },
  sectionEyebrow: { color: '#6F8298', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 4 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: { width: '48%', flexGrow: 1, minHeight: 100, borderRadius: 19, backgroundColor: '#0E1E32', borderWidth: 1, borderColor: '#223B55', padding: 14, justifyContent: 'space-between' },
  actionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#DCE8F3', fontSize: 12, fontWeight: '800', marginTop: 12 },
  lucyCard: { flexDirection: 'row', borderRadius: 21, padding: 17, borderWidth: 1, borderColor: 'rgba(196,155,255,0.24)', marginTop: 22 },
  lucyMark: { width: 45, height: 45, borderRadius: 15, backgroundColor: 'rgba(196,155,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  lucyCopy: { flex: 1, marginLeft: 13 },
  lucyTitle: { color: '#F3EAFF', fontSize: 13, fontWeight: '900' },
  lucyText: { color: '#AFA0C5', fontSize: 11, lineHeight: 17, marginTop: 4 },
  cta: { height: 55, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  ctaText: { color: '#06101D', fontSize: 15, fontWeight: '900' },
  disclaimer: { color: '#5F7186', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 13, paddingHorizontal: 20 },
});

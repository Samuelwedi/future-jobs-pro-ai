import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

type StoryKey = 'operate' | 'prove' | 'pay';
type IconName = keyof typeof MaterialIcons.glyphMap;
type Story = {
  eyebrow: string; headline: string; copy: string; icon: IconName; color: string;
  gradient: [string, string, string]; metric: string; metricLabel: string;
  moments: Array<{ icon: IconName; title: string; meta: string }>; outcome: string;
};

const stories: Record<StoryKey, Story> = {
  operate: {
    eyebrow: 'LIVE OPERATIONS', headline: 'Know what is happening before anyone has to ask.',
    copy: 'One calm command view connects crews, jobs, schedules, time, and exceptions in real time.',
    icon: 'space-dashboard', color: '#67E8F9', gradient: ['#123B55', '#0A2235', '#08131F'],
    metric: '98%', metricLabel: 'illustrative schedule confidence',
    moments: [
      { icon: 'login', title: 'Main Street crew arrived', meta: '4 workers · GPS verified' },
      { icon: 'auto-awesome', title: 'Lucy found a shift conflict', meta: 'Resolution prepared for approval' },
      { icon: 'photo-camera', title: 'Site progress captured', meta: 'AI compliance check complete' },
    ], outcome: 'Managers see the day as it unfolds—not after the paperwork arrives.',
  },
  prove: {
    eyebrow: 'EVIDENCE GRAPH', headline: 'Turn field activity into a story nobody has to reconstruct.',
    copy: 'Time, GPS, photos, video, documents, and voice notes become one defensible chain of work.',
    icon: 'verified-user', color: '#A7F3D0', gradient: ['#124C46', '#0B292B', '#08131F'],
    metric: '100%', metricLabel: 'illustrative chain completeness',
    moments: [
      { icon: 'route', title: 'GPS trail sealed', meta: '46 location points · animated replay' },
      { icon: 'graphic-eq', title: 'Voice context preserved', meta: 'Audio, transcript, and on-screen notes' },
      { icon: 'inventory', title: 'Evidence package generated', meta: 'PDF + media + verification manifest' },
    ], outcome: 'Every claim can carry its own timeline, location, media, and human context.',
  },
  pay: {
    eyebrow: 'WORK TO PAY', headline: 'Move from verified hours to payroll without re-entering the truth.',
    copy: 'Approved time flows through overtime, vacation, payroll readiness, and year-end records.',
    icon: 'account-balance-wallet', color: '#FDE68A', gradient: ['#4A3615', '#27200F', '#08131F'],
    metric: '0', metricLabel: 'illustrative unresolved exceptions',
    moments: [
      { icon: 'schedule', title: '318 hours approved', meta: 'Time and job allocation verified' },
      { icon: 'rule', title: 'Policies applied', meta: 'Overtime and vacation rules reviewed' },
      { icon: 'payments', title: 'Payroll preview ready', meta: 'Manager approval is the final step' },
    ], outcome: 'Operations and payroll work from the same verified record.',
  },
};

const tabs: Array<{ key: StoryKey; label: string; icon: IconName }> = [
  { key: 'operate', label: 'Operate', icon: 'space-dashboard' },
  { key: 'prove', label: 'Prove', icon: 'verified-user' },
  { key: 'pay', label: 'Pay', icon: 'payments' },
];

export default function DemoScreen() {
  const navigation = useNavigation<any>();
  const [activeStory, setActiveStory] = useState<StoryKey>('operate');
  const story = useMemo(() => stories[activeStory], [activeStory]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#071827', '#050A12', '#03070C']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back to sign in" onPress={() => navigation.goBack()} style={styles.iconButton}>
          <MaterialIcons name="arrow-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}><MaterialIcons name="auto-awesome" size={17} color="#06121D" /></View>
          <View><Text style={styles.brand}>Future Jobs Pro AI</Text><Text style={styles.brandMeta}>Interactive product story</Text></View>
        </View>
        <View style={styles.demoPill}><View style={styles.demoDot} /><Text style={styles.demoText}>DEMO</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>THE INTELLIGENT FIELD OPERATING SYSTEM</Text>
          <Text style={styles.heroTitle}>Field work,{`\n`}finally connected.</Text>
          <Text style={styles.heroCopy}>Run the day. Prove the work. Pay the team. Lucy keeps the entire workflow moving—with people in control.</Text>
          <View style={styles.valueRow}>
            {[['bolt', 'Real-time', '#67E8F9'], ['verified-user', 'Verifiable', '#A7F3D0'], ['hub', 'One system', '#C4B5FD']].map(([icon, label, color]) => (
              <View key={label} style={styles.valueItem}><MaterialIcons name={icon as IconName} size={17} color={color} /><Text style={styles.valueText}>{label}</Text></View>
            ))}
          </View>
        </View>

        <View style={styles.storyTabs}>
          {tabs.map((tab) => {
            const selected = tab.key === activeStory;
            return (
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} key={tab.key} onPress={() => setActiveStory(tab.key)} style={[styles.storyTab, selected && styles.storyTabActive]}>
                <MaterialIcons name={tab.icon} size={18} color={selected ? '#06121D' : '#8091A6'} />
                <Text style={[styles.storyTabText, selected && styles.storyTabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <LinearGradient colors={story.gradient} style={styles.productWindow}>
          <View style={styles.windowChrome}>
            <View style={styles.windowDots}><View style={styles.windowDot} /><View style={styles.windowDot} /><View style={styles.windowDot} /></View>
            <Text style={styles.windowLabel}>FUTURE JOBS · LIVE WORKSPACE</Text>
            <View style={styles.secureChip}><MaterialIcons name="lock" size={11} color="#A7F3D0" /><Text style={styles.secureText}>SECURE</Text></View>
          </View>
          <View style={styles.storyHeader}>
            <View style={[styles.storyIcon, { backgroundColor: `${story.color}20`, borderColor: `${story.color}55` }]}><MaterialIcons name={story.icon} size={24} color={story.color} /></View>
            <View style={styles.storyMetric}><Text style={[styles.metricValue, { color: story.color }]}>{story.metric}</Text><Text style={styles.metricLabel}>{story.metricLabel}</Text></View>
          </View>
          <Text style={[styles.storyEyebrow, { color: story.color }]}>{story.eyebrow}</Text>
          <Text style={styles.storyHeadline}>{story.headline}</Text>
          <Text style={styles.storyCopy}>{story.copy}</Text>
          <View style={styles.timeline}>
            {story.moments.map((moment, index) => (
              <View key={moment.title} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineNode, { borderColor: story.color }]}><MaterialIcons name={moment.icon} size={16} color={story.color} /></View>
                  {index < story.moments.length - 1 && <View style={[styles.timelineLine, { backgroundColor: `${story.color}44` }]} />}
                </View>
                <View style={styles.timelineCopy}><Text style={styles.timelineTitle}>{moment.title}</Text><Text style={styles.timelineMeta}>{moment.meta}</Text></View>
                <MaterialIcons name="check-circle" size={18} color="#34D399" />
              </View>
            ))}
          </View>
          <View style={styles.outcomeCard}><MaterialIcons name="insights" size={19} color={story.color} /><Text style={styles.outcomeText}>{story.outcome}</Text></View>
        </LinearGradient>

        <View style={styles.lucySection}>
          <LinearGradient colors={['#34255E', '#19152C']} style={styles.lucyOrb}><MaterialIcons name="graphic-eq" size={29} color="#EDE9FE" /></LinearGradient>
          <View style={styles.lucyBody}>
            <View style={styles.lucyTitleRow}><Text style={styles.lucyTitle}>Lucy is the connective intelligence</Text><View style={styles.memoryPill}><View style={styles.memoryDot} /><Text style={styles.memoryText}>MEMORY</Text></View></View>
            <Text style={styles.lucyCopy}>She understands context across the workspace, prepares actions, and asks for confirmation before sensitive changes.</Text>
            <View style={styles.promptBubble}><Text style={styles.promptText}>“Brief me on today’s risks and prepare the next actions.”</Text></View>
          </View>
        </View>

        <View style={styles.platformSection}>
          <Text style={styles.sectionEyebrow}>ONE CONTINUOUS RECORD</Text><Text style={styles.sectionTitle}>From first clock-in to final proof.</Text>
          <View style={styles.platformFlow}>
            {[['Capture', 'location-on', '#67E8F9'], ['Understand', 'auto-awesome', '#C4B5FD'], ['Verify', 'verified', '#A7F3D0'], ['Settle', 'payments', '#FDE68A']].map(([label, icon, color], index) => (
              <React.Fragment key={label}>
                <View style={styles.flowItem}><View style={[styles.flowIcon, { backgroundColor: `${color}18` }]}><MaterialIcons name={icon as IconName} size={20} color={color} /></View><Text style={styles.flowLabel}>{label}</Text></View>
                {index < 3 && <MaterialIcons name="arrow-forward" size={15} color="#385069" />}
              </React.Fragment>
            ))}
          </View>
        </View>

        <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <LinearGradient colors={['#67E8F9', '#22D3EE']} style={styles.primaryButtonGradient}><Text style={styles.primaryButtonText}>Explore with your own workspace</Text><MaterialIcons name="arrow-forward" size={20} color="#06121D" /></LinearGradient>
        </TouchableOpacity>
        <Text style={styles.disclaimer}>This tour uses illustrative data and does not display customer information.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#03070C' },
  header: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#132536' },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1824', borderWidth: 1, borderColor: '#1B3044' },
  brandLockup: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 11 }, brandMark: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#67E8F9', marginRight: 9 },
  brand: { color: '#F8FAFC', fontSize: 14, fontWeight: '900' }, brandMeta: { color: '#6F8499', fontSize: 9, marginTop: 2 },
  demoPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 20, backgroundColor: '#082B3C', borderWidth: 1, borderColor: '#164E63' }, demoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22D3EE' }, demoText: { color: '#A5F3FC', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 50 }, hero: { paddingTop: 32, paddingBottom: 24 },
  kicker: { color: '#67E8F9', fontSize: 10, letterSpacing: 1.8, fontWeight: '900' }, heroTitle: { color: '#F8FAFC', fontSize: 40, lineHeight: 43, fontWeight: '900', letterSpacing: -1.5, marginTop: 12 }, heroCopy: { color: '#9AAABD', fontSize: 15, lineHeight: 23, marginTop: 13 },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 20 }, valueItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0A1520', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: '#172A3C' }, valueText: { color: '#C5D0DC', fontSize: 11, fontWeight: '700' },
  storyTabs: { flexDirection: 'row', padding: 4, borderRadius: 17, backgroundColor: '#09131D', borderWidth: 1, borderColor: '#172A3C', marginBottom: 14 }, storyTab: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 13 }, storyTabActive: { backgroundColor: '#E6FBFF' }, storyTabText: { color: '#8091A6', fontSize: 12, fontWeight: '800' }, storyTabTextActive: { color: '#06121D' },
  productWindow: { borderRadius: 26, padding: 18, borderWidth: 1, borderColor: '#29445B', overflow: 'hidden' }, windowChrome: { flexDirection: 'row', alignItems: 'center', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#FFFFFF12' }, windowDots: { flexDirection: 'row', gap: 4 }, windowDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#5F7387' }, windowLabel: { color: '#73879A', fontSize: 8, letterSpacing: 1, fontWeight: '900', flex: 1, marginLeft: 10 }, secureChip: { flexDirection: 'row', alignItems: 'center', gap: 4 }, secureText: { color: '#A7F3D0', fontSize: 8, fontWeight: '900' },
  storyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }, storyIcon: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, storyMetric: { alignItems: 'flex-end', maxWidth: 150 }, metricValue: { fontSize: 28, fontWeight: '900', letterSpacing: -1 }, metricLabel: { color: '#8295A8', fontSize: 8, textAlign: 'right', marginTop: 1 },
  storyEyebrow: { fontSize: 9, letterSpacing: 1.5, fontWeight: '900', marginTop: 20 }, storyHeadline: { color: '#F8FAFC', fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.5, marginTop: 7 }, storyCopy: { color: '#B4C2CF', fontSize: 13, lineHeight: 20, marginTop: 9 },
  timeline: { marginTop: 21, paddingTop: 4 }, timelineRow: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 59 }, timelineRail: { width: 38, alignItems: 'center', alignSelf: 'stretch' }, timelineNode: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, backgroundColor: '#08131F', alignItems: 'center', justifyContent: 'center', zIndex: 2 }, timelineLine: { width: 1, flex: 1, minHeight: 22 }, timelineCopy: { flex: 1, paddingLeft: 7, paddingRight: 8, paddingBottom: 14 }, timelineTitle: { color: '#EDF4FA', fontSize: 13, fontWeight: '800' }, timelineMeta: { color: '#8091A2', fontSize: 10, lineHeight: 15, marginTop: 3 },
  outcomeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#050B12AA', borderRadius: 15, padding: 13, borderWidth: 1, borderColor: '#FFFFFF12' }, outcomeText: { color: '#C7D3DE', fontSize: 11, lineHeight: 17, flex: 1, fontWeight: '600' },
  lucySection: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, padding: 18, backgroundColor: '#121021', borderRadius: 23, borderWidth: 1, borderColor: '#3D2F67' }, lucyOrb: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, lucyBody: { flex: 1, marginLeft: 13 }, lucyTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, lucyTitle: { color: '#F5F3FF', fontSize: 14, fontWeight: '900', flexShrink: 1 }, memoryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: '#241D3A' }, memoryDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#A78BFA' }, memoryText: { color: '#C4B5FD', fontSize: 7, fontWeight: '900' }, lucyCopy: { color: '#AAA2BE', fontSize: 11, lineHeight: 17, marginTop: 7 }, promptBubble: { marginTop: 10, backgroundColor: '#211A36', borderRadius: 12, padding: 10, borderLeftWidth: 2, borderLeftColor: '#A78BFA' }, promptText: { color: '#DDD6FE', fontSize: 10, lineHeight: 15, fontStyle: 'italic' },
  platformSection: { marginTop: 18, backgroundColor: '#09131D', borderRadius: 23, padding: 18, borderWidth: 1, borderColor: '#172A3C' }, sectionEyebrow: { color: '#67E8F9', fontSize: 9, letterSpacing: 1.5, fontWeight: '900' }, sectionTitle: { color: '#F8FAFC', fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 6 }, platformFlow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }, flowItem: { alignItems: 'center', flex: 1 }, flowIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, flowLabel: { color: '#AAB7C4', fontSize: 8, fontWeight: '700', marginTop: 6 },
  primaryButton: { marginTop: 20, borderRadius: 16, overflow: 'hidden' }, primaryButtonGradient: { paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, primaryButtonText: { color: '#06121D', fontSize: 14, fontWeight: '900' }, disclaimer: { color: '#5F7285', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 13 },
});

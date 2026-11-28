import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AdaptiveModal } from './AdaptiveModal';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';

type Member = { id: string; name: string | null; role: string; assigned: boolean };
type Owner = { id: string; companyId: string; role: string };

export function ProjectRosterModal({ owner, project, close }: {
  owner: Owner; project: { id: string; name: string }; close: () => void;
}) {
  const { t } = useLang();
  const generation = useRef(0), active = useRef(false), busy = useRef(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);

  async function refresh(change?: { userId: string; assigned: boolean }) {
    if (busy.current || !active.current) return;
    const epoch = generation.current;
    const sessionCurrent = api.captureSessionGuard();
    const current = () => active.current && generation.current === epoch && sessionCurrent();
    busy.current = true; setPending(true); setFailed(false);
    try {
      if (change) {
        const confirmation = await api.projectRoster<{ success: boolean; assigned: boolean }>(project.id, owner, current, change);
        if (!current()) return;
        if (confirmation?.success !== true || confirmation.assigned !== change.assigned) throw new Error('Unconfirmed change');
      }
      const result = await api.projectRoster<{ success: boolean; members: Member[] }>(project.id, owner, current);
      if (!current()) return;
      if (result?.success !== true || !Array.isArray(result.members) || result.members.some(m =>
        !m || typeof m.id !== 'string' || typeof m.role !== 'string' || typeof m.assigned !== 'boolean' ||
        (m.name !== null && typeof m.name !== 'string'))) throw new Error('Invalid project team');
      setMembers(result.members);
    } catch {
      if (current()) { setMembers([]); setFailed(true); }
    } finally {
      if (active.current && generation.current === epoch) { busy.current = false; setPending(false); }
    }
  }

  useEffect(() => {
    active.current = true;
    void refresh();
    return () => { active.current = false; generation.current++; busy.current = false; };
  }, []);

  const dismiss = () => { active.current = false; generation.current++; close(); };
  const query = search.trim().toLocaleLowerCase();
  const visible = members.filter(member => !query || (member.name || '').toLocaleLowerCase().includes(query));
  return (
    <AdaptiveModal visible animationType="slide" onRequestClose={dismiss}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.title}>{t('Project team')}</Text>
            <Text style={styles.detail}>{project.name}</Text>
          </View>
          <TouchableOpacity style={styles.control} accessibilityRole="button" onPress={dismiss}>
            <Text style={styles.action}>{t('Close')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.detail}>{t('Assignments are for planning. They do not change app access.')}</Text>
        <TextInput style={styles.search} value={search} onChangeText={setSearch} editable={!pending}
          placeholder={t('Search team by name')} placeholderTextColor="#AAA" accessibilityLabel={t('Search team by name')} />
        {pending ? <ActivityIndicator color="#00D4FF" accessibilityLabel={t('Checking project team')} /> :
          failed ? <View accessibilityRole="alert">
            <Text style={styles.detail}>{t('Could not confirm the project team. Refresh before changing it again.')}</Text>
            <TouchableOpacity style={styles.control} accessibilityRole="button" onPress={() => void refresh()}>
              <Text style={styles.action}>{t('Try again')}</Text>
            </TouchableOpacity>
          </View> :
          <FlatList data={visible} keyboardShouldPersistTaps="handled" keyExtractor={m => m.id}
            ListEmptyComponent={<Text style={styles.detail}>{t('No team members found.')}</Text>}
            renderItem={({ item }) => <View style={styles.row}>
              <View style={styles.heading}>
                <Text style={styles.name}>{item.name || t('Team member')}</Text>
                <Text style={styles.detail}>{t(item.role)}{item.assigned ? ' · ' + t('Assigned') : ''}</Text>
              </View>
              <TouchableOpacity style={styles.control} accessibilityRole="button"
                accessibilityLabel={t(item.assigned ? 'Remove {name} from project' : 'Add {name} to project', { name: item.name || t('Team member') })}
                onPress={() => void refresh({ userId: item.id, assigned: !item.assigned })}>
                <Text style={styles.action}>{t(item.assigned ? 'Remove' : 'Add')}</Text>
              </TouchableOpacity>
            </View>} />}
      </View>
    </AdaptiveModal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, gap: 12, backgroundColor: '#111' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  heading: { flex: 1, flexShrink: 1 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '700' },
  name: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  detail: { color: '#BBB', fontSize: 15, lineHeight: 22 },
  search: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#666', borderRadius: 8, color: '#FFF' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  control: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 12 },
  action: { color: '#00D4FF', fontWeight: '700', fontSize: 16 },
});

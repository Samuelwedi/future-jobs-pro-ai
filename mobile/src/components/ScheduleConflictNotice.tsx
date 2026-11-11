import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { api } from '../services/api';

interface Preview {
  success: true;
  coverage: 'saved_same_day_assignments';
  applicable: boolean;
  conflictingEmployeeCount: number;
  conflictingShiftCount: number;
  uncheckedShiftCount: number;
}
interface Props {
  date: string;
  startTime: string;
  endTime: string;
  projectId: string;
  employeeIds: string[];
  excludeShiftId?: string;
}
type State = { key: string; current: () => boolean; phase: 'checking' | 'error' | 'done'; preview?: Preview };
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
function validPreview(value: any): value is Preview {
  return value?.success === true && value.coverage === 'saved_same_day_assignments'
    && typeof value.applicable === 'boolean' && count(value.conflictingEmployeeCount)
    && count(value.conflictingShiftCount) && count(value.uncheckedShiftCount);
}

export function ScheduleConflictNotice(props: Props) {
  const { user } = useAuth();
  const { t } = useLang();
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const canManage = ['boss', 'manager', 'admin'].includes(user?.role || '');
  const ready = canManage && !!props.projectId && props.employeeIds.length > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(props.date)
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(props.startTime)
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(props.endTime);
  const key = JSON.stringify([props.date, props.startTime, props.endTime, props.projectId,
    [...new Set(props.employeeIds)].sort(), props.excludeShiftId, user?.id, user?.companyId, user?.role, refresh]);

  const currentKey = useRef(key);
  currentKey.current = key;

  useFocusEffect(useCallback(() => {
    let live = true;
    const sessionCurrent = api.captureSessionGuard();
    const current = () => live && currentKey.current === key && sessionCurrent();
    if (!ready || !user) { setState(null); return () => { live = false; }; }
    setState({ key, current, phase: 'checking' });
    // Debounce edits, but do not delay or block saving a shift.
    const timeout = setTimeout(async () => {
      try {
        if (!current()) return;
        const preview = await api.checkScheduleConflicts<Preview>({ ...props }, user, current);
        if (!current()) return;
        if (!validPreview(preview)) throw new Error('Invalid overlap response');
        setState({ key, current, phase: 'done', preview });
      } catch {
        if (current()) setState({ key, current, phase: 'error' });
      }
    }, 350);
    return () => { live = false; clearTimeout(timeout); };
  }, [key, ready]));

  if (!canManage) return null;
  const visible = state?.key === key && state.current() ? state : null;
  const preview = visible?.preview;
  let message = t('Select a project and employees, and enter HH:MM times to check overlaps.');
  if (ready) {
    message = t('Recheck overlaps for the current assignments.');
    if (visible?.phase === 'checking') message = t('Checking saved assignments…');
    if (visible?.phase === 'error') message = t('Overlap check unavailable. Review the schedule manually. You can still save.');
    else if (preview && !preview.applicable) message = t('These times need manual review. Overnight and equal-time shifts cannot be checked.');
    else if (preview) message = preview.conflictingEmployeeCount > 0
      ? t('Possible overlap: {count} selected employees have overlapping saved shifts.', { count: String(preview.conflictingEmployeeCount) })
      : t('No overlap found among saved same-day assignments.');
  }
  return <View style={styles.container}>
    <Text style={styles.title}>{t('Assignment overlap check')}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
    {!!preview?.uncheckedShiftCount && <Text style={styles.message}>{t('Some saved shifts have times that need manual review.')}</Text>}
    <Text style={styles.scope}>{t('Advisory only. Checks saved same-day assignments, not recurring rules or overnight shifts. Other changes may happen after this check. Saving is still allowed.')}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={!ready || visible?.phase === 'checking'}
      onPress={() => setRefresh(value => value + 1)} style={styles.refresh}>
      <Text style={styles.link}>{t('Recheck overlaps')}</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#685529', backgroundColor: '#211D12' },
  title: { color: '#FFE0A0', fontWeight: '600', marginBottom: 6 },
  message: { color: '#FFF', marginBottom: 6 },
  scope: { color: '#CCC', fontSize: 12 },
  refresh: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: '#00D4FF' },
});

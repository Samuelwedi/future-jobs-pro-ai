import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useLang } from '../context/LanguageContext';
import { exportAttachmentToDevice } from '../services/attachmentDeviceExport';

export default function SaveMediaFile({ path, name, current, light = false }: {
  path: string; name: string; current: () => boolean; light?: boolean;
}) {
  const { t } = useLang();
  const [phase, setPhase] = useState<'preparing'|'downloading'|'opening'|null>(null);
  const [feedback, setFeedback] = useState<'error'|'cancelled'|null>(null);
  const [percent, setPercent] = useState<number | undefined>(undefined);
  const android = Platform.OS === 'android';
  const mounted = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const presenting = useRef(false);
  const owner = useRef({ path, current });
  owner.current = { path, current };
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => {
      // Opening the OS chooser can itself background the app. The authority
      // check was made before handoff; do not delete the receiving app's file.
      if (state !== 'active' && !presenting.current) operation.current?.abort();
    });
    return () => {
      mounted.current = false;
      if (!presenting.current) operation.current?.abort();
      listener.remove();
    };
  }, []);

  const save = async () => {
    const allowed = () => mounted.current && owner.current.path === path && current() && owner.current.current() &&
      AppState.currentState === 'active';
    if (!allowed() || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setFeedback(null); setPercent(undefined); setPhase('preparing');
    try {
      await exportAttachmentToDevice(path, name, allowed, (next, value) => {
        if (next === 'opening') presenting.current = true;
        setPhase(next); setPercent(value);
      }, t(android ? 'Open or share file' : 'Save file to device'), controller.signal);
    } catch {
      if (allowed() && !controller.signal.aborted) setFeedback('error');
    } finally {
      operation.current = null;
      presenting.current = false;
      if (mounted.current) setPhase(null);
    }
  };

  const action = android ? 'Open or share file…' : 'Save to Files…';
  const label = phase === 'downloading' ? (percent === undefined ? t('Downloading…') : t('Downloading: {percent}%', { percent: String(percent) }))
    : phase ? t('Preparing file…') : t(action);
  const cancel = () => {
    if (!operation.current || presenting.current) return;
    operation.current.abort();
    setFeedback('cancelled');
  };
  return <View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t(android ? 'Open or share {name}' : 'Save {name} to Files',{ name })}
      accessibilityState={{ busy: !!phase, disabled: !!phase }} disabled={!!phase}
      style={{ paddingVertical: 12, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
      onPress={() => void save()}>
      {!!phase && <ActivityIndicator size="small" />}
      <Text style={{ color: light ? '#67E8F9' : '#136D87', fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
    {phase && phase !== 'opening' && <TouchableOpacity accessibilityRole="button" onPress={cancel}
      style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{color: light ? '#DCE6F2' : '#334455'}}>{t('Cancel download')}</Text></TouchableOpacity>}
    {phase === 'opening' && <Text accessibilityLiveRegion="polite" style={{color: light ? '#DCE6F2' : '#334455'}}>
      {t(android ? 'Choose an app in the device menu.' : 'Choose Save to Files in the device menu.')}</Text>}
    {feedback === 'error' && <Text accessibilityRole="alert" style={{ color: light ? '#FCA5A5' : '#9B1C1C' }}>{t('Could not prepare this file. Tap again to retry.')}</Text>}
    {feedback === 'cancelled' && <Text accessibilityLiveRegion="polite" style={{color: light ? '#DCE6F2' : '#334455'}}>{t('Download cancelled.')}</Text>}
  </View>;
}

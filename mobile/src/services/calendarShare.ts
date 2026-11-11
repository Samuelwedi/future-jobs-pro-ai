import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Prune only files created by this exporter. Never remove a recently handed-off URI. */
async function pruneCalendarCache(directory: string): Promise<void> {
  const names = await FileSystem.readDirectoryAsync(directory).catch(() => [] as string[]);
  const cutoff = Date.now() - CACHE_LIFETIME_MS;
  for (const name of names) {
    const match = /^schedule_(\d{13})_[a-z0-9]+\.ics$/.exec(name);
    if (match && Number(match[1]) < cutoff) {
      await FileSystem.deleteAsync(directory + name, { idempotent: true }).catch(() => {});
    }
  }
}

/** Opens only the explicit native share chooser. Does not write calendar events or upload files. */
export async function shareCalendarFile(contents: string, isCurrent: () => boolean): Promise<void> {
  if (!isCurrent()) return;
  if (Platform.OS === 'web') throw new Error('Calendar file sharing is available in the iOS and Android apps.');
  const available = await Sharing.isAvailableAsync();
  if (!isCurrent()) return;
  if (!available) throw new Error('Sharing is unavailable on this device');
  if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable');
  const directory = `${FileSystem.cacheDirectory}calendar-exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await pruneCalendarCache(directory);
  if (!isCurrent()) return;
  const uri = `${directory}schedule_${Date.now()}_${Math.random().toString(36).slice(2)}.ics`;
  let handoffAttempted = false;
  try {
    await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
    if (!isCurrent()) return;
    // Android resolves when the chooser returns, before a recipient necessarily reads the URI.
    // Even a rejected share can have an uncertain native outcome, so retain after attempting it.
    handoffAttempted = true;
    await Sharing.shareAsync(uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics' });
  } finally {
    if (!handoffAttempted) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }
}

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { Alert, AppState, DeviceEventEmitter } from 'react-native';
import { API_URL } from './api';

const TASK = 'future-jobs-active-shift-location';
const SESSION = 'activeGpsShift';
const DISCLOSURE_VERSION = 1;
type Shift = { userId: string; timeEntryId: string; projectId: string };
type TrackingSession = Shift & { disclosureVersion: number };
let generation = 0;
let cancelDisclosure: (() => void) | undefined;
let operations: Promise<unknown> = Promise.resolve();
const status = (message: string) => DeviceEventEmitter.emit('gps-tracking-status', message);
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation, operation);
  operations = result.catch(() => undefined);
  return result;
}
function readSession(raw: string | null): TrackingSession | null {
  try {
    const value = JSON.parse(raw || 'null');
    return value?.disclosureVersion === DISCLOSURE_VERSION && value.userId && value.timeEntryId ? value : null;
  } catch { return null; }
}
async function clearTracking() {
  await SecureStore.deleteItemAsync(SESSION);
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
}
function disclose(): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true; cancelDisclosure = undefined; resolve(accepted);
    };
    cancelDisclosure = () => finish(false);
    Alert.alert(
    'Location during your work shift',
    'Future Jobs Pro AI collects location data to record your work-shift route and share it with your company for crew tracking, even when the app is closed or not in use. Background tracking is limited to an active clocked-in shift. Clock out or sign out to stop it. You can decline background tracking and continue using the app. Android may ask you to select Allow all the time in Settings.',
    [
      { text: 'Not now', style: 'cancel', onPress: () => finish(false) },
      { text: 'Continue', onPress: () => finish(true) },
    ],
    { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error) { status('Background location paused'); return; }
  const run = generation;
  const raw = await SecureStore.getItemAsync(SESSION);
  const session = readSession(raw);
  const token = await SecureStore.getItemAsync('authToken');
  let userId: string | undefined;
  try { userId = JSON.parse(await SecureStore.getItemAsync('userData') || 'null')?.id; } catch { /* fail closed */ }
  if (!session || !token || session.userId !== userId) {
    if (run === generation) await stopBackgroundLocation();
    return;
  }
  for (const point of data?.locations || []) {
    // Do not send a queued point after logout, clock-out or a session switch.
    if (run !== generation || await SecureStore.getItemAsync(SESSION) !== raw) return;
    try {
      const { disclosureVersion: _consent, ...shift } = session;
      const response = await fetch(`${API_URL}/gps/update`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...shift, ...point.coords, capturedAt: new Date(point.timestamp).toISOString() }),
      });
      if (run !== generation) return;
      if (response.status === 401 || response.status === 403) { await stopBackgroundLocation(); return; }
      status(response.ok ? 'Background tracking active' : 'GPS upload pending connection');
    } catch { if (run === generation) status('GPS upload unavailable while offline'); }
  }
});

export function startBackgroundLocation(session: Shift): Promise<void> {
  cancelDisclosure?.();
  const run = ++generation;
  return serialized(async () => {
    const current = () => run === generation;
    if (!current()) return;
    const existing = readSession(await SecureStore.getItemAsync(SESSION));
    if (existing?.userId === session.userId && existing.timeEntryId === session.timeEntryId &&
        existing.projectId === session.projectId && await Location.hasStartedLocationUpdatesAsync(TASK)) return;
    await clearTracking();
    if (!current()) return;
    if (AppState.currentState !== 'active') throw new Error('Open the app to enable background tracking');
    const accepted = await disclose();
    if (!current()) return;
    if (!accepted) throw new Error('Background tracking declined; foreground GPS remains available');
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!current()) return;
    if (fg.status !== 'granted') throw new Error('Location permission is required for GPS');
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!current()) return;
    if (bg.status !== 'granted') throw new Error('Background permission not granted; foreground GPS remains available');
    let userId: string | undefined;
    try { userId = JSON.parse(await SecureStore.getItemAsync('userData') || 'null')?.id; } catch { /* fail closed */ }
    if (!current() || userId !== session.userId || !await SecureStore.getItemAsync('authToken')) return;
    await SecureStore.setItemAsync(SESSION, JSON.stringify({ ...session, disclosureVersion: DISCLOSURE_VERSION }));
    if (!current()) { await clearTracking(); return; }
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 20,
        pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'Future Jobs work tracking',
          notificationBody: 'Location is shared during your active shift. Clock out to stop.', killServiceOnDestroy: true },
      });
      if (!current()) { await clearTracking(); return; }
      status('Background tracking active');
    } catch (error) { await clearTracking(); throw error; }
  });
}
export function stopBackgroundLocation(): Promise<void> {
  ++generation;
  cancelDisclosure?.();
  // Invalidate uploads immediately; native start/stop operations stay serialized.
  return serialized(clearTracking);
}

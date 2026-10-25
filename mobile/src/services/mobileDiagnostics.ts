import { Platform } from 'react-native';
import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';

// Read the installed binary, not app.json (EAS assigns build numbers remotely).
export function mobileDiagnosticContext() {
  return {
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: nativeApplicationVersion || 'unknown',
    buildVersion: nativeBuildVersion || 'unknown',
  };
}

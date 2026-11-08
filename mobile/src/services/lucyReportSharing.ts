import {Directory, File, Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {Platform} from 'react-native';
import type {LucyWorkReport} from '../utils/lucyWorkReport';

export type TemporaryLucyReport = {share: (title: string) => Promise<void>; cleanup: () => void | Promise<void>};
export type LucyReportSharing = {
  isAvailable: () => Promise<boolean>;
  createTemporary: (report: LucyWorkReport) => TemporaryLucyReport | Promise<TemporaryLucyReport>;
};
let sequence = 0;
let sheetOpen = false;

/** Only user-selected native sharing. No upload, public URL, permission or config changes.
 * Normal cleanup removes only the directory this operation created. An abrupt process
 * termination can leave private cache behind until OS/app cleanup; erasure is not guaranteed.
 */
export const nativeLucyReportSharing: LucyReportSharing = {
  isAvailable: async () => (Platform.OS === 'android' || Platform.OS === 'ios') && await Sharing.isAvailableAsync(),
  createTemporary(report) {
    if (!/^[A-Za-z0-9_-]{1,120}\.txt$/.test(report.filename)) throw new Error('shareError');
    // A dedicated, non-overwritten cache directory prevents collisions across accounts/panels.
    const directory = new Directory(Paths.cache, `lucy-report-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`);
    directory.create();
    const cleanup = () => {if (directory.exists) directory.delete();};
    try {
      const file = new File(directory, report.filename);
      file.create();
      file.write(report.text, {encoding: 'utf8'});
      return {
        share: async title => {
          // An old account's open sheet must not overlap a new controller's sheet.
          if (sheetOpen) throw new Error('shareError');
          sheetOpen = true;
          try {await Sharing.shareAsync(file.uri, {mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: title});}
          finally {sheetOpen = false;}
        },
        cleanup,
      };
    } catch (error) {cleanup(); throw error;}
  },
};

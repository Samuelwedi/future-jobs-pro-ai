import * as FileSystem from 'expo-file-system/legacy';

const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Prune only this exporter's old generated files, never originals or cache directories. */
export async function prepareTimesheetExportDirectory(cacheDirectory: string, isCurrent: () => boolean): Promise<string | null> {
  if (!isCurrent()) return null;
  const directory = `${cacheDirectory}timesheet-exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  if (!isCurrent()) return null;
  const names = await FileSystem.readDirectoryAsync(directory).catch(() => [] as string[]);
  if (!isCurrent()) return null;
  const cutoff = Date.now() - CACHE_LIFETIME_MS;
  for (const name of names) {
    if (!isCurrent()) return null;
    const match = /^timesheet_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_(\d{13})_[a-z0-9]+\.(csv|pdf)$/.exec(name);
    if (!match || Number(match[1]) >= cutoff) continue;
    const uri = directory + name;
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (!isCurrent()) return null;
    // A matching directory must not trigger recursive deletion. A newer write also
    // keeps an older filename alive (for example, a slow download finishing later).
    if (info?.exists && !info.isDirectory && Number.isFinite(info.modificationTime)
      && info.modificationTime * 1000 < cutoff) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }
  return isCurrent() ? directory : null;
}

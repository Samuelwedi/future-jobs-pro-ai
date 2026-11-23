import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, API_URL } from './api';

const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const directFile = new RegExp(`^/chat/attachments/${uuid}/content$`, 'i');
const latestBytes = 25 * 1024 * 1024;
const localRetentionMs = 60 * 60_000;

export const canOfferChatFileExport = (path: string) => directFile.test(path);
export function exportFilename(value: string | null, fallback: string) {
  const utf8 = value?.match(/(?:^|;)\s*filename\*=UTF-8''([^;]+)/i)?.[1]?.trim();
  const quoted = value?.match(/(?:^|;)\s*filename="([^"]+)"/i)?.[1];
  let name = quoted || fallback;
  if (utf8) {
    try { name = decodeURIComponent(utf8); } catch { /* Use safe fallback. */ }
  }
  return (name.split(/[\\/]/).pop() || '')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"|?*]/g, '_')
    .replace(/^\.+|[. ]+$/g, '').replace(/^\s+/, '').replace(/[\uD800-\uDFFF]/gu, '_')
    .replace(/^(.{1,100})(?:.*?)(\.[a-z0-9]{1,10})$/iu, '$1$2').slice(0, 112) || 'attachment';
}

type ExportPhase = 'downloading' | 'opening';
export async function exportAttachmentToDevice(
  path: string, suggestedName: string, current: () => boolean,
  report: (phase: ExportPhase, percent?: number) => void, dialogTitle: string, signal: AbortSignal,
) {
  if (!directFile.test(path) || !current() || signal.aborted) return;
  const check = () => { if (!current() || signal.aborted) throw new Error('Attachment view changed'); };
  const origin = new URL(API_URL);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash)
    throw new Error('Attachment origin is unavailable');
  let folder: Directory | undefined;
  let handedOff = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let output: ReturnType<File['open']> | undefined;
  try {
    if (!await Sharing.isAvailableAsync()) throw new Error('Device save is unavailable');
    check();
    const token = await api.getToken();
    check();
    if (!token) throw new Error('Sign in before saving this file');
    report('downloading');
    // Fetch only the app API's existing authenticated routes, never a message URL.
    // Expo SDK 55 fetch checks redirect:'error' in its native clients.
    const result = await fetch(API_URL + path, {
      redirect: 'error', credentials: 'omit', signal, headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' },
    });
    reader = result.body?.getReader();
    check();
    const mime = (result.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    // The server reports the revalidated decoded size from the attachment record.
    // HTTP Content-Length can describe a differently encoded wire representation.
    const length = result.headers.get('x-chat-attachment-bytes');
    const expected = length !== null && /^[1-9][0-9]*$/.test(length) ? Number(length) : NaN;
    if (result.status !== 200 || !reader || !/^(?:image|video|audio|application|text)\/[a-z0-9.+-]+$/.test(mime) ||
        /^(?:text\/html|(?:application|text)\/(?:xml|javascript|xhtml\+xml)|image\/svg\+xml)$/.test(mime) ||
        /(?:^|[+/])json$/.test(mime) ||
        !Number.isSafeInteger(expected) || expected > latestBytes)
      throw new Error('The attachment was not returned as a file');

    const cache = new Directory(Paths.cache, 'attachment-device-exports');
    cache.create({ idempotent: true });
    // An OS consumer can read after the chooser resolves; keep handed-off bytes
    // briefly in private cache and reclaim on a later invocation. Not app data.
    try {
      const stale = Date.now() - localRetentionMs;
      for (const entry of cache.list()) {
        const stamp = /^(\d{13})-[a-z0-9]+$/.exec(entry.name);
        if (entry instanceof Directory && stamp && Number(stamp[1]) < stale) entry.delete();
      }
    } catch { /* Best-effort only; the OS also reclaims cache. */ }
    folder = new Directory(cache, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    folder.create();
    const file = new File(folder, exportFilename(result.headers.get('content-disposition'), suggestedName));
    file.create();
    output = file.open();
    let count = 0;
    let lastProgress = 0;
    while (true) {
      const part = await reader.read();
      check();
      if (part.done) break;
      count += part.value.byteLength;
      if (count > expected) throw new Error('Invalid attachment length');
      output.writeBytes(part.value);
      {
        const percent = Math.min(99, Math.floor(100 * count / expected));
        if (percent >= lastProgress + 5) { lastProgress = percent; report('downloading', percent); }
      }
    }
    output.close();
    output = undefined;
    if (count !== expected || file.size !== count) throw new Error('Incomplete attachment download');
    check();
    report('opening');
    check();
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle });
    handedOff = true;
    // Choosing or dismissing the sheet is not a verified save receipt.
  } finally {
    try { output?.close(); } catch { /* Continue cleanup. */ }
    if (reader) {
      try { await reader.cancel(); } catch { /* Already closed or failed. */ }
      reader.releaseLock();
    }
    if (!handedOff) try { folder?.delete(); } catch { /* No file intentionally retained on failure. */ }
  }
}

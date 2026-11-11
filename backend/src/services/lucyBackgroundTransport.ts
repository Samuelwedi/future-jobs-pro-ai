import { LucyBackgroundError } from './lucyBackgroundProvider';

export const LUCY_BACKGROUND_HTTP_LIMITS = Object.freeze({ requestBytes: 256000, responseBytes: 256000, timeoutMs: 45000 });
/** A dispatch fence at the actual SDK transport boundary, not only before the SDK's awaits.
 * Reject redirects without following them. Buffer a finite response before SDK JSON parsing so
 * an incompatible endpoint cannot return unbounded data or stream forever after HTTP headers.
 */
export function guardedLucyFetch(urls: string[], allowed: () => Promise<boolean>, current: () => boolean, apiKey: string): typeof fetch {
  return async (input, init) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!urls.includes(target) || init?.method !== 'POST' || typeof init.body !== 'string'
      || Buffer.byteLength(init.body) > LUCY_BACKGROUND_HTTP_LIMITS.requestBytes) throw new LucyBackgroundError();
    if (!await allowed() || !current()) throw new LucyBackgroundError();
    const timeout = AbortSignal.timeout(LUCY_BACKGROUND_HTTP_LIMITS.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    // No await may intervene between allowed() and invoking this fixed transport destination.
    const response = await globalThis.fetch(target, { ...init, headers: new Headers({ 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${apiKey}` }), redirect: 'error', credentials: 'omit', signal });
    if (response.status >= 300 && response.status < 400 || response.redirected || response.url && response.url !== target) {
      await response.body?.cancel(); throw new LucyBackgroundError();
    }
    const size = response.headers.get('content-length');
    if (size && (!/^\d+$/.test(size) || Number(size) > LUCY_BACKGROUND_HTTP_LIMITS.responseBytes)) {
      await response.body?.cancel(); throw new LucyBackgroundError();
    }
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    if (!reader) throw new LucyBackgroundError();
    let abort: () => void;
    const stopped = new Promise<never>((_, reject) => {
      abort = () => { reject(new LucyBackgroundError()); void reader.cancel().catch(() => undefined); };
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    });
    try {
      for (;;) {
        const chunk = await Promise.race([reader.read(), stopped]);
        if (signal.aborted) throw new LucyBackgroundError();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > LUCY_BACKGROUND_HTTP_LIMITS.responseBytes) throw new LucyBackgroundError();
        chunks.push(chunk.value);
      }
      return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally { signal.removeEventListener('abort', abort!); void reader.cancel().catch(() => undefined); }
  };
}

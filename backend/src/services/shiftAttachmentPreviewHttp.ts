import type { RequestHandler } from 'express';

type ReadPreview = (actorId: string, companyId: string, shiftId: string, attachmentId: string, signal: AbortSignal) => Promise<Buffer | null>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bounded, non-cacheable derivative response; never returns an original URL. */
export function createShiftAttachmentPreviewHandler(
  actorFromAuth: (request: Parameters<RequestHandler>[0]) => string | undefined,
  read: ReadPreview,
  timeoutMs = 3_000,
  capacity = 2,
): RequestHandler {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000
      || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4) {
    throw new RangeError('Invalid shift preview budgets');
  }
  let active = 0;
  return (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const end = (status: number) => {
      if (!res.destroyed && !res.writableEnded) { res.statusCode = status; res.end(); }
    };
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); end(405); return; }
    const actor = actorFromAuth(req);
    if (!actor || !uuid.test(actor)) { end(401); return; }
    const company = req.get('X-Project-Company');
    if (req.get('X-Project-Actor') !== actor || !company || !uuid.test(company)) { end(403); return; }
    const { shiftId, attachmentId } = req.params;
    if (typeof shiftId !== 'string' || typeof attachmentId !== 'string'
        || !uuid.test(shiftId) || !uuid.test(attachmentId)) { end(404); return; }
    if (res.destroyed || res.writableEnded) return;
    if (active >= capacity) { end(503); return; }

    active++;
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.once('close', abort);
    const deadline = setTimeout(() => { abort(); end(503); }, timeoutMs);
    // A timed-out or disconnected operation retains its slot until it really
    // settles, even if a dependency ignores cancellation.
    void Promise.resolve().then(() => controller.signal.aborted ? null :
      read(actor, company, shiftId, attachmentId, controller.signal)).then(preview => {
      if (controller.signal.aborted || res.destroyed || res.writableEnded) return;
      if (!preview) { end(404); return; }
      if (!Buffer.isBuffer(preview) || preview.length < 3 || preview.length > 256 * 1024
          || preview[0] !== 0xff || preview[1] !== 0xd8 || preview[2] !== 0xff) { end(503); return; }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', String(preview.length));
      res.statusCode = 200;
      // No framework auto-ETag, conditional 304, redirect, or range response.
      res.end(preview);
    }).catch(() => end(503)).finally(() => {
      clearTimeout(deadline);
      res.off('close', abort);
      active--;
    });
  };
}

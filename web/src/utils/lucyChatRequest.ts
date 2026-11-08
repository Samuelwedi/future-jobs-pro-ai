/** Memory-only request receipts. Never persist chat payloads or authentication here.
 * Keep this dependency-free module identical in web and mobile (covered by tests).
 */
export type LucyChatPayload = Readonly<{message: string; language: string; channel: 'text'|'voice'; conversationMode?: boolean; requestId: string}>;
export type LucyRequestState = 'processing'|'uncertain'|'expired';
export type LucyChatAttempt = Readonly<{payload: LucyChatPayload; epoch: number; sequence: number; checking: boolean}>;
export type LucyChatSnapshot = Readonly<{busy: boolean; pending: boolean; state: LucyRequestState|null; requestId: string|null; canCheck: boolean}>;
export type LucyChatOutcome = {kind: 'stale'|'completed'|'unresolved'; data?: any};

// IDs are deduplication keys, not authentication secrets. The timestamp/counter
// fallback supports native runtimes without Web Crypto and adds no dependency.
let nextId = 0;
export function createLucyRequestId(): string {
  const crypto = (globalThis as any).crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `lucy-${Date.now().toString(36)}-${(++nextId).toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export class LucyChatRequestController {
  private scope = '';
  private active = true;
  private epoch = 0;
  private sequence = 0;
  private flight: LucyChatAttempt|null = null;
  private pending: {payload: LucyChatPayload; state: LucyRequestState; checkable: boolean}|null = null;
  constructor(private makeId: () => string = createLucyRequestId) {}
  snapshot(): LucyChatSnapshot {
    return {busy: !!this.flight, pending: !!this.pending, state: this.pending?.state ?? null,
      requestId: this.pending?.payload.requestId ?? null,
      canCheck: this.active && !this.flight && !!this.pending?.checkable && this.pending.state !== 'expired'};
  }
  setScope(scope: string): boolean {
    if (scope === this.scope) return false;
    this.scope = scope; this.epoch++; this.flight = null; this.pending = null;
    return true;
  }
  suspend() {
    this.active = false; this.epoch++; this.flight = null;
    // A hidden response is not an acknowledgement the user has seen.
    if (this.pending?.state === 'processing') this.pending.state = 'uncertain';
  }
  resume() {this.active = true;}
  begin(payload: Omit<LucyChatPayload, 'requestId'>): LucyChatAttempt|null {
    if (!this.active || !this.scope || this.pending || !payload.message.trim()) return null;
    this.pending = {payload: Object.freeze({...payload, message: payload.message.trim(), requestId: this.makeId()}), state: 'processing', checkable: true};
    return this.attempt(false);
  }
  check(): LucyChatAttempt|null {
    return this.snapshot().canCheck ? this.attempt(true) : null;
  }
  private attempt(checking: boolean): LucyChatAttempt {
    const attempt = Object.freeze({payload: this.pending!.payload, epoch: this.epoch, sequence: ++this.sequence, checking});
    this.flight = attempt;
    return attempt;
  }
  isCurrent(attempt: LucyChatAttempt): boolean {
    return this.active && this.epoch === attempt.epoch && this.pending?.payload === attempt.payload && this.flight === attempt;
  }
  receive(attempt: LucyChatAttempt, data: any, status = 200): LucyChatOutcome {
    if (!this.isCurrent(attempt)) return {kind: 'stale'};
    this.flight = null;
    const receipt = data?.request;
    const matching = receipt?.id === attempt.payload.requestId;
    if (matching && receipt.state === 'completed' && status >= 200 && status < 300) {
      this.pending = null;
      return {kind: 'completed', data};
    }
    if (this.pending) {
      this.pending.state = matching && receipt.state === 'processing' ? 'processing' : matching && receipt.state === 'expired' ? 'expired' : 'uncertain';
      // A response without our receipt might be from an older server which does
      // not implement deduplication. Do not encourage an unsafe POST retry.
      this.pending.checkable = matching && ['processing','uncertain'].includes(receipt.state);
    }
    const hasResult = (Array.isArray(data?.actions) && data.actions.length > 0) || !!data?.action
      || (!attempt.checking && status >= 200 && status < 300 && receipt?.state !== 'processing' && typeof data?.text === 'string');
    // Preserve actual action receipts even if saving the request receipt failed.
    // Never render a mismatched response from a different request.
    return {kind: 'unresolved', ...(hasResult && (!receipt || matching) ? {data} : {})};
  }
  fail(attempt: LucyChatAttempt): LucyChatOutcome {
    if (!this.isCurrent(attempt)) return {kind: 'stale'};
    this.flight = null;
    if (this.pending) this.pending.state = 'uncertain';
    return {kind: 'unresolved'};
  }
  /** Only after a user confirms the duplicate-action warning. Never auto-reset. */
  startNewAfterWarning(expectedRequestId: string): boolean {
    if (!this.active || this.flight || this.pending?.payload.requestId !== expectedRequestId) return false;
    this.epoch++; this.pending = null;
    return true;
  }
}

export function lucyRequestNotice(state: LucyChatSnapshot): string {
  if (!state.pending) return '';
  if (state.busy) return 'Waiting for Lucy’s request receipt…';
  if (state.state === 'processing') return 'Lucy is still processing the previous request. Check its receipt before sending another request.';
  if (state.state === 'expired') return 'The previous request receipt has expired. Its actions may already have completed. Review your records before starting a new request.';
  return state.canCheck
    ? 'The previous request’s outcome is not confirmed. Its actions may already have completed. Check the previous request without creating a new one.'
    : 'The previous request’s outcome is not confirmed, and a safe receipt check is unavailable. Its actions may already have completed. Review your records before starting a new request.';
}

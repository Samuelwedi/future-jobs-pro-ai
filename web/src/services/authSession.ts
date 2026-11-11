// Synchronous web auth generation. Every app-owned credential/identity writer
// uses these helpers so even A -> B -> A cannot revive work from an old login.
let revision = 0;
let observedKey: string | undefined;
function userIdentity(raw: string | null): string {
  try {
    const user = JSON.parse(raw || 'null');
    return JSON.stringify([user?.id, user?.companyId ?? user?.company_id, user?.role]);
  } catch { return 'invalid'; }
}
function identityKey(): string {
  try {
    return JSON.stringify([localStorage.getItem('token'), userIdentity(localStorage.getItem('user')), localStorage.getItem('auth-generation')]);
  } catch { return ''; }
}
export function getAuthRevision(): number {
  const next = identityKey();
  if (observedKey !== undefined && next !== observedKey) revision++;
  observedKey = next;
  return revision;
}
export function captureAuthSession() {
  const expected = getAuthRevision();
  return { isCurrent: () => getAuthRevision() === expected };
}
function advanceGeneration() {
  // Persist only a nonsecret nonce, not a credential. Other tabs can fence ABA
  // synchronously even before the browser delivers their storage events.
  const generation = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;
  localStorage.setItem('auth-generation', generation);
}
function announce() { window.dispatchEvent(new Event('auth-session-changed')); }
export function setAuthSession(token: string, user: unknown) {
  revision++;
  try {
    // If generation persistence fails, do not replace credentials.
    advanceGeneration();
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  } finally {
    observedKey = identityKey();
    announce();
  }
}
export function clearAuthSession(current: () => boolean = () => true): boolean {
  if (!current()) return false;
  revision++;
  let marked = false;
  try { advanceGeneration(); marked = true; } catch { /* A full store must not prevent logout. */ }
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } finally {
    // Removal may have freed enough space for the cross-tab marker. Credential
    // removal itself also invalidates other tabs; a new login requires a marker.
    if (!marked) { try { advanceGeneration(); } catch {} }
    observedKey = identityKey();
    announce();
  }
  return true;
}
export function updateAuthUser(user: unknown, current: () => boolean = () => true): boolean {
  if (!current()) return false;
  getAuthRevision();
  const serialized = JSON.stringify(user);
  const changed = userIdentity(serialized) !== userIdentity(localStorage.getItem('user'));
  // Fail closed before an identity change if the marker cannot be persisted.
  if (changed) advanceGeneration();
  localStorage.setItem('user', serialized);
  getAuthRevision();
  if (changed) announce();
  window.dispatchEvent(new CustomEvent('auth-user-updated', { detail: user }));
  return true;
}
// Storage events also carry transient changes when another tab replaces the
// credentials and changes them back before this tab gets a turn to render.
if (typeof window !== 'undefined') window.addEventListener('storage', (event: StorageEvent) => {
  if (event.storageArea !== localStorage) return;
  if (event.key === 'user' && userIdentity(event.oldValue) === userIdentity(event.newValue)) return;
  if (event.key !== null && !['token', 'user', 'auth-generation'].includes(event.key)) return;
  if (event.key !== null && event.oldValue === event.newValue) return;
  revision++;
  observedKey = identityKey();
  announce();
});

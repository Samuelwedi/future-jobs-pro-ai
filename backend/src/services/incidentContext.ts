// Only technical evidence is retained/passed to the IT model, never arbitrary
// request bodies, tokens, contact details or device identifiers.
export function sanitizeIncidentContext(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['platform', 'appVersion', 'buildVersion', 'osVersion', 'componentStack', 'errorStack']) {
    if (typeof source[key] !== 'string') continue;
    result[key] = source[key].slice(0, key.endsWith('Stack') ? 4000 : 100)
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted]')
      .replace(/\bsk-[\w-]+/g, '[redacted]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]');
  }
  return result;
}

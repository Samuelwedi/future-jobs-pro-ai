export function passwordPolicyError(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 72) return 'Use 8 to 72 characters for your password.';
  if (!/[a-zA-Z]/.test(value) || !/[^a-zA-Z]/.test(value)) return 'Include letters and a number, symbol, or space in your password.';
  return null;
}

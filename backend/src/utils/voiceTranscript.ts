export function requireVoiceTranscript(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('No speech was detected. The voice note was not processed. Please record again.');
  return value.trim();
}

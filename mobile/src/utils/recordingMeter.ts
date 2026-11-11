/** Rolling native dB readings, not synthetic animation or speech detection. */
export const METER_BARS = 20;
export const emptyMeter = () => Array<number>(METER_BARS).fill(0);

export function meterLevel(decibels: unknown): number | null {
  if (typeof decibels !== 'number' || !Number.isFinite(decibels)) return null;
  // Speech is typically in the upper part of the native -160..0 dB range.
  return Math.max(0, Math.min(1, (decibels + 60) / 60));
}

export function appendMeter(history: number[], decibels: unknown): number[] {
  const level = meterLevel(decibels);
  return [...history.slice(-(METER_BARS - 1)), level ?? 0];
}

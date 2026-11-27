// Local transport telemetry only. Never a provider-processing or saved receipt.
export type EvidenceProgress = { phase: 'checking' | 'uploading'; loaded?: number; total?: number };
export function evidenceProgressCopy(progress: EvidenceProgress, t: (key:string, values?:Record<string,string>)=>string): string {
  if (progress.phase === 'checking') return t('Checking saved upload status…');
  if (progress.total !== undefined && progress.loaded !== undefined) {
    if (progress.loaded === progress.total) return t('Transport sent. Waiting for server confirmation; not yet confirmed saved.');
    return t('Transport sent: {percent}%. Waiting for server confirmation.', { percent: String(Math.floor(progress.loaded / progress.total * 100)) });
  }
  return t('Uploading; progress unavailable. Waiting for server confirmation.');
}

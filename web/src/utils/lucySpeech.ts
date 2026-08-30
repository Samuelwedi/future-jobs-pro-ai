type LucySpeechOptions = {
  enabled?: boolean;
  lang?: string;
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

const preferredVoices = [
  'Microsoft Zira - English (United States)',
  'Google UK English Female',
  'Samantha',
  'Karen',
  'Moira',
  'Fiona',
];

async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const available = window.speechSynthesis.getVoices();
  if (available.length) return available;

  return new Promise(resolve => {
    const finish = () => {
      window.clearTimeout(timeout);
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };
    const timeout = window.setTimeout(finish, 1200);
    window.speechSynthesis.addEventListener('voiceschanged', finish);
  });
}

export async function speakAsLucy(text: string, options: LucySpeechOptions = {}): Promise<void> {
  if (options.enabled === false || !('speechSynthesis' in window) || !text.trim()) {
    options.onEnd?.();
    return;
  }

  const voices = await loadVoices();
  const voice = preferredVoices
    .map(name => voices.find(candidate => candidate.name === name))
    .find((candidate): candidate is SpeechSynthesisVoice => Boolean(candidate));
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice || null;
  utterance.lang = voice?.lang || options.lang || 'en-US';
  utterance.rate = options.rate ?? 1;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = event => options.onError?.(event.error || 'Speech playback failed');
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// mobile/src/services/deepgramService.ts
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// TODO: move to .env
const DEEPGRAM_API_KEY = 'YOUR_DEEPGRAM_API_KEY';

interface DeepgramConfig {
  model?: string;
  language?: string;
  interim_results?: boolean;
  endpointing?: number;
  punctuate?: boolean;
  smart_format?: boolean;
  diarize?: boolean;
  vad_events?: boolean;
}

export class DeepgramService {
  private ws: WebSocket | null = null;
  private onTranscript: (text: string, isFinal: boolean) => void;
  private onError: (err: any) => void;
  private audioRecorder: Audio.Recording | null = null;
  private isRecording = false;
  private chunkInterval: ReturnType<typeof setInterval> | null = null;
    stopRecording: any;

  constructor(
    onTranscript: (text: string, isFinal: boolean) => void,
    onError: (err: any) => void
  ) {
    this.onTranscript = onTranscript;
    this.onError = onError;
  }

  async start(config: DeepgramConfig = {}) {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      this.onError('Microphone permission denied');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const params = new URLSearchParams({
      model: config.model || 'nova-3',
      language: config.language || 'en',
      interim_results: String(config.interim_results ?? true),
      endpointing: String(config.endpointing ?? 1000),
      punctuate: String(config.punctuate ?? true),
      smart_format: String(config.smart_format ?? true),
      diarize: String(config.diarize ?? true),
      vad_events: String(config.vad_events ?? true),
    });

    this.ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`);

    this.ws.onopen = () => {
      console.log('Deepgram WebSocket open');
      this.ws!.send(JSON.stringify({
        type: 'Settings',
        config: {
          model: 'nova-3',
          interim_results: true,
          endpointing: 1000,
        },
      }));
      this.startRecording();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'Results') {
        const transcript = data.channel.alternatives[0].transcript;
        const isFinal = data.is_final;
        if (transcript) {
          this.onTranscript(transcript, isFinal);
        }
      }
    };

    this.ws.onerror = (err) => {
      this.onError(err);
    };

    this.ws.onclose = () => {
      console.log('Deepgram WebSocket closed');
      this.stopRecording();
    };
  }

  private async startRecording() {
    try {
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
        },
        ios: {
            extension: '.wav',
            audioQuality: Audio.IOSAudioQuality.MIN,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 0
        },
      });
      this.audioRecorder = recording;
      this.isRecording = true;

      // Placeholder for chunk streaming – we'll use expo-audio in production
      this.chunkInterval = setInterval(async () => {
        // TODO: read PCM chunks and send to WebSocket
      }, 300);
    } catch (err) {
      this.onError(err);
    }
  }

  stop() {
    this.isRecording = false;
    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.audioRecorder?.stopAndUnloadAsync();
    this.audioRecorder = null;
  }
}
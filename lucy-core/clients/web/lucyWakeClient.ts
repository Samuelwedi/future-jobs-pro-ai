export type LucyWakeStatus = 'off' | 'connecting' | 'listening' | 'detected' | 'error';

type Options = {
  url: string;
  token: () => string | null;
  onWake: (event: { phrase: string; score: number; at: number }) => void;
  onStatus?: (status: LucyWakeStatus, message?: string) => void;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export class LucyWakeClient {
  private socket?: WebSocket;
  private context?: AudioContext;
  private stream?: MediaStream;
  private processor?: ScriptProcessorNode;

  constructor(private readonly options: Options) {}

  async start() {
    if (this.socket) return;
    this.options.onStatus?.('connecting');
    const token = this.options.token();
    const endpoint = new URL(this.options.url);
    if (token) endpoint.searchParams.set('token', token);
    this.socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket!;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Lucy wake service connection failed'));
    });
    this.socket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'wake') {
        this.options.onStatus?.('detected');
        this.options.onWake(message);
      }
    };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = event => this.send(event.inputBuffer.getChannelData(0), this.context!.sampleRate);
    source.connect(this.processor);
    this.processor.connect(this.context.destination);
    this.options.onStatus?.('listening');
  }

  private send(input: Float32Array, sampleRate: number) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const ratio = sampleRate / 16000;
    const output = new Int16Array(Math.floor(input.length / ratio));
    for (let i = 0; i < output.length; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      output[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    this.socket.send(JSON.stringify({
      type: 'audio',
      sampleRate: 16000,
      pcm16Base64: toBase64(new Uint8Array(output.buffer)),
    }));
  }

  async stop() {
    this.processor?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    await this.context?.close();
    this.socket?.close();
    this.processor = undefined;
    this.stream = undefined;
    this.context = undefined;
    this.socket = undefined;
    this.options.onStatus?.('off');
  }
}

import { LucyStreamingDetector } from '../core/lucy-wake-core.mjs';

export class LucyWebWakeListener {
  constructor(model, onWake, options = {}) {
    this.detector = new LucyStreamingDetector(model, options);
    this.onWake = onWake;
    this.enabled = false;
    this.handleVisibility = () => {
      if (!this.enabled) return;
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        void this.startCapture();
      } else {
        void this.stopCapture();
      }
    };
    this.handlePageHide = () => { void this.stopCapture(); };
  }

  async start() {
    this.enabled = true;
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('focus', this.handleVisibility);
    window.addEventListener('blur', this.handleVisibility);
    window.addEventListener('pagehide', this.handlePageHide);
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    await this.startCapture();
  }

  async startCapture() {
    if (!this.enabled || this.context || this.starting || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    this.starting = true;
    try {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    this.context = new AudioContext({ latencyHint: 'interactive' });
    const context = this.context;
    await context.resume();
    this.source = context.createMediaStreamSource(this.stream);
    this.processor = context.createScriptProcessor(4096, 1, 1);
    this.sink = context.createGain();
    this.sink.gain.value = 0;
    this.processor.onaudioprocess = event => {
      const samples = event.inputBuffer.getChannelData(0);
      if (!this.enabled || this.context !== context || context.state === 'closed') return;
      for (const wake of this.detector.push(samples, context.sampleRate)) this.onWake(wake);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(this.context.destination);
    } finally {
      this.starting = false;
      if (!this.enabled || document.visibilityState !== 'visible' || !document.hasFocus()) await this.stopCapture();
    }
  }

  async stop() {
    this.enabled = false;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('focus', this.handleVisibility);
    window.removeEventListener('blur', this.handleVisibility);
    window.removeEventListener('pagehide', this.handlePageHide);
    await this.stopCapture();
  }

  async stopCapture() {
    if (!this.context) return;
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    await this.context.close();
    this.context = this.stream = this.processor = this.source = this.sink = null;
    this.detector.reset();
  }
}

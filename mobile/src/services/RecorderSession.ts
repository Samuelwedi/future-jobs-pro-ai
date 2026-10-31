import type { AudioRecorder, RecorderState } from 'expo-audio';

type Lease = {
  recorder: AudioRecorder;
  pending: boolean;
  cancelled: boolean;
  released: boolean;
  recording: boolean;
};

/** Owns native lifetime: no release while prepare/stop is awaiting native work. */
export class RecorderSession {
  private lease: Lease | null = null;
  private enabled = false;

  constructor(private readonly create: () => AudioRecorder) {}

  activate() { this.enabled = true; }

  get isRecording() { return !!this.lease?.recording && !this.lease.cancelled; }

  async start(): Promise<boolean> {
    if (!this.enabled || this.lease) return false;
    const lease: Lease = {
      recorder: this.create(), pending: true, cancelled: false, released: false, recording: false,
    };
    this.lease = lease;
    try {
      await lease.recorder.prepareToRecordAsync();
      if (lease.cancelled || !this.enabled) return false;
      lease.recorder.record();
      lease.recording = true;
      return true;
    } catch (error) {
      lease.cancelled = true;
      throw error;
    } finally {
      lease.pending = false;
      if (lease.cancelled || !this.enabled) this.release(lease);
    }
  }

  async stop(): Promise<string | null> {
    const lease = this.lease;
    if (!lease || lease.cancelled || lease.pending || !lease.recording) return null;
    lease.pending = true;
    lease.recording = false;
    try {
      await lease.recorder.stop();
      // A navigation/unmount during stop must not read uri or upload audio.
      if (lease.cancelled || !this.enabled) return null;
      return lease.recorder.uri;
    } finally {
      lease.pending = false;
      this.release(lease);
    }
  }

  status(): RecorderState | null {
    const lease = this.lease;
    if (!this.enabled || !lease || lease.pending || lease.cancelled || !lease.recording) return null;
    try {
      return lease.recorder.getStatus();
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  cancel() {
    const lease = this.lease;
    if (!lease) return;
    lease.cancelled = true;
    const wasRecording = lease.recording;
    lease.recording = false;
    if (lease.pending) return;
    if (!wasRecording) { this.release(lease); return; }
    lease.pending = true;
    // Navigation may cancel an active recording. Stop native work before release.
    void (async () => {
      try { await lease.recorder.stop(); } catch { /* Cancellation discards audio. */ }
      finally { lease.pending = false; this.release(lease); }
    })();
  }

  dispose() {
    this.enabled = false;
    this.cancel();
  }

  private release(lease: Lease) {
    if (lease.released) return;
    lease.released = true;
    if (this.lease === lease) this.lease = null;
    // Expo releases native recording resources; never query a getter after this.
    try { lease.recorder.release(); } catch { /* Already invalidated by native teardown. */ }
  }
}

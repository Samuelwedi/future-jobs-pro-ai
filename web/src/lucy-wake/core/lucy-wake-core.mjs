/** Lucy wake-word inference core. No network, API key, native dependency, or framework. */
export class LucyWakeCore {
  constructor(model) {
    if (!model || model.format !== 'lucy-linear-audio-classifier-v1') {
      throw new Error('Unsupported Lucy model');
    }
    this.model = model;
    this.sampleRate = model.sample_rate_hz;
    this.clipSamples = model.clip_samples;
    this.melBank = createMelBank(this.sampleRate, 512, 32);
  }

  predict(input, inputRate = this.sampleRate) {
    const audio = resampleToLength(input, inputRate, this.sampleRate, this.clipSamples);
    const vector = extractFeatures(audio, this.sampleRate, this.melBank);
    const normalized = vector.map((value, index) =>
      (value - this.model.scaler_mean[index]) / this.model.scaler_scale[index]
    );
    const logits = this.model.weights.map((row, classIndex) =>
      row.reduce((sum, weight, index) => sum + weight * normalized[index], this.model.bias[classIndex])
    );
    const probabilities = softmax(logits);
    const scores = Object.fromEntries(this.model.labels.map((label, index) => [label, probabilities[index]]));
    const bestIndex = probabilities.indexOf(Math.max(...probabilities));
    return { label: this.model.labels[bestIndex], confidence: probabilities[bestIndex], scores };
  }
}

export class LucyStreamingDetector {
  constructor(model, options = {}) {
    this.core = new LucyWakeCore(model);
    this.threshold = options.threshold ?? model.recommended_wake_threshold ?? 0.82;
    this.stepSamples = options.stepSamples ?? 4000;
    this.cooldownMs = options.cooldownMs ?? 1800;
    this.buffer = new Float32Array(0);
    this.lastWakeAt = 0;
  }

  push(samples, inputRate = this.core.sampleRate) {
    const converted = resample(samples, inputRate, this.core.sampleRate);
    const combined = new Float32Array(this.buffer.length + converted.length);
    combined.set(this.buffer);
    combined.set(converted, this.buffer.length);
    this.buffer = combined;
    const events = [];
    while (this.buffer.length >= this.core.clipSamples) {
      const window = this.buffer.slice(0, this.core.clipSamples);
      const result = this.core.predict(window);
      const now = Date.now();
      if (result.label !== 'background' && result.confidence >= this.threshold && now - this.lastWakeAt >= this.cooldownMs) {
        this.lastWakeAt = now;
        events.push({ ...result, detectedAt: now });
      }
      this.buffer = this.buffer.slice(Math.min(this.stepSamples, this.buffer.length));
    }
    return events;
  }

  reset() { this.buffer = new Float32Array(0); }
}

export function resample(input, sourceRate, targetRate) {
  const source = input instanceof Float32Array ? input : Float32Array.from(input);
  if (sourceRate === targetRate) return source;
  const outputLength = Math.max(1, Math.round(source.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < outputLength; index++) {
    const position = index * ratio;
    const left = Math.min(Math.floor(position), source.length - 1);
    const right = Math.min(left + 1, source.length - 1);
    const fraction = position - left;
    output[index] = source[left] * (1 - fraction) + source[right] * fraction;
  }
  return output;
}

function resampleToLength(input, sourceRate, targetRate, length) {
  const converted = resample(input, sourceRate, targetRate);
  if (converted.length === length) return converted;
  const output = new Float32Array(length);
  output.set(converted.slice(0, length));
  return output;
}

function hzToMel(value) { return 2595 * Math.log10(1 + value / 700); }
function melToHz(value) { return 700 * (10 ** (value / 2595) - 1); }

function createMelBank(rate, fftSize, count) {
  const start = hzToMel(80);
  const end = hzToMel(7600);
  const points = Array.from({ length: count + 2 }, (_, index) => melToHz(start + (end - start) * index / (count + 1)));
  const bins = points.map(value => Math.floor((fftSize + 1) * value / rate));
  return Array.from({ length: count }, (_, index) => {
    const bank = new Float64Array(fftSize / 2 + 1);
    const [left, center, right] = bins.slice(index, index + 3);
    for (let item = left; item < center; item++) bank[item] = (item - left) / Math.max(center - left, 1);
    for (let item = center; item < right; item++) bank[item] = (right - item) / Math.max(right - center, 1);
    return bank;
  });
}

function fftPower(frame, fftSize) {
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  let windowSum = 0;
  for (let index = 0; index < frame.length; index++) {
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / frame.length);
    real[index] = frame[index] * window;
    windowSum += window;
  }
  for (let index = 1, target = 0; index < fftSize; index++) {
    let bit = fftSize >> 1;
    for (; target & bit; bit >>= 1) target ^= bit;
    target ^= bit;
    if (index < target) [real[index], real[target]] = [real[target], real[index]];
  }
  for (let length = 2; length <= fftSize; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (let offset = 0; offset < fftSize; offset += length) {
      let wr = 1, wi = 0;
      for (let item = 0; item < length / 2; item++) {
        const even = offset + item;
        const odd = even + length / 2;
        const tr = wr * real[odd] - wi * imaginary[odd];
        const ti = wr * imaginary[odd] + wi * real[odd];
        real[odd] = real[even] - tr;
        imaginary[odd] = imaginary[even] - ti;
        real[even] += tr;
        imaginary[even] += ti;
        const nextWr = wr * cosine - wi * sine;
        wi = wr * sine + wi * cosine;
        wr = nextWr;
      }
    }
  }
  const scale = windowSum * windowSum;
  return Float64Array.from({ length: fftSize / 2 + 1 }, (_, index) =>
    (real[index] * real[index] + imaginary[index] * imaginary[index]) / scale
  );
}

function percentile90(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = 0.9 * (sorted.length - 1);
  const left = Math.floor(position);
  const fraction = position - left;
  return sorted[left] * (1 - fraction) + sorted[Math.min(left + 1, sorted.length - 1)] * fraction;
}

function extractFeatures(audio, rate, melBank) {
  const frameSize = 400, hop = 160, fftSize = 512;
  const bands = Array.from({ length: melBank.length }, () => []);
  for (let start = 0; start + frameSize <= audio.length; start += hop) {
    const power = fftPower(audio.slice(start, start + frameSize), fftSize);
    melBank.forEach((filter, bandIndex) => {
      let energy = 0;
      for (let index = 0; index < filter.length; index++) energy += power[index] * filter[index];
      bands[bandIndex].push(Math.log1p(energy * 1000));
    });
  }
  const means = bands.map(values => values.reduce((a, b) => a + b, 0) / values.length);
  const deviations = bands.map((values, index) =>
    Math.sqrt(values.reduce((sum, value) => sum + (value - means[index]) ** 2, 0) / values.length)
  );
  const high = bands.map(percentile90);
  let energy = 0, crossings = 0, peak = 0;
  for (let index = 0; index < audio.length; index++) {
    energy += audio[index] * audio[index];
    peak = Math.max(peak, Math.abs(audio[index]));
    if (index > 0 && (audio[index] < 0) !== (audio[index - 1] < 0)) crossings++;
  }
  const rms = Math.sqrt(energy / audio.length);
  const zcr = crossings / Math.max(audio.length - 1, 1);
  return [...means, ...deviations, ...high, rms, zcr, peak / Math.max(rms, 1e-6)];
}

function softmax(values) {
  const maximum = Math.max(...values);
  const exponentials = values.map(value => Math.exp(value - maximum));
  const total = exponentials.reduce((a, b) => a + b, 0);
  return exponentials.map(value => value / total);
}

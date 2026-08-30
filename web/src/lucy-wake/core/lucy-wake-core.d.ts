export type LucyLabel = 'background' | 'lucy' | 'hey_lucy';
export type LucyPrediction = {
  label: LucyLabel;
  confidence: number;
  scores: Record<LucyLabel, number>;
};
export type LucyWakeEvent = LucyPrediction & { detectedAt: number };

export class LucyWakeCore {
  constructor(model: object);
  predict(input: Float32Array | number[], inputRate?: number): LucyPrediction;
}

export class LucyStreamingDetector {
  constructor(model: object, options?: { threshold?: number; stepSamples?: number; cooldownMs?: number });
  push(samples: Float32Array | number[], inputRate?: number): LucyWakeEvent[];
  reset(): void;
}

export function resample(input: Float32Array | number[], sourceRate: number, targetRate: number): Float32Array;

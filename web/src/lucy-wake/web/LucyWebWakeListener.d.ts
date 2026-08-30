import type { LucyWakeEvent } from '../core/lucy-wake-core.mjs';
export class LucyWebWakeListener {
  constructor(model: object, onWake: (event: LucyWakeEvent) => void, options?: object);
  start(): Promise<void>;
  stop(): Promise<void>;
}

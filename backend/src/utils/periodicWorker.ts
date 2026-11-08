/** A single periodic task whose in-flight run remains drainable during shutdown. */
export function createPeriodicWorker(run: () => Promise<unknown>, onError: (error: unknown) => void) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let draining: Promise<void> | undefined;
  const tick = () => {
    if (!timer || pending) return;
    pending = Promise.resolve().then(() => timer ? run() : undefined).then(() => undefined, onError).finally(() => { pending = undefined; });
  };
  return {
    start(intervalMs: number) {
      if (timer || draining) return;
      // Node turns NaN/invalid delays into a 1ms loop. A malformed environment
      // value must not turn a diagnostic poller into continuous database load.
      const delay = Number.isFinite(intervalMs) && intervalMs >= 1 && intervalMs <= 2_147_483_647 ? Math.floor(intervalMs) : 60_000;
      timer = setInterval(tick, delay);
      timer.unref();
      tick();
    },
    stop(): Promise<void> {
      if (draining) return draining;
      if (timer) clearInterval(timer);
      timer = undefined;
      draining = Promise.resolve(pending).finally(() => { draining = undefined; });
      return draining;
    },
  };
}

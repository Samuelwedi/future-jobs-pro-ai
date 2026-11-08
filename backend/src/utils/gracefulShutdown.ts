type ShutdownStep = { name: string; run: () => void | Promise<unknown> };
type ShutdownOptions = {
  drains: ShutdownStep[];
  resources: ShutdownStep[];
  forceClose: () => void;
  timeoutMs?: number;
  exit?: (code: number) => void;
  log?: (message: string) => void;
};

/** One deadline covers draining and resource cleanup, not a fresh timeout per step. */
export function shutdownTimeoutMs(value = process.env.SHUTDOWN_TIMEOUT_MS): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 100 && parsed <= 120_000 ? Math.floor(parsed) : 25_000;
}

export function createGracefulShutdown(options: ShutdownOptions) {
  let stopping = false;
  let terminal = false;
  let pending: Promise<void> | undefined;
  const log = options.log || console.log;
  const exit = options.exit || ((code: number) => process.exit(code));
  const finish = (code: number) => {
    if (terminal) return;
    terminal = true;
    exit(code);
  };
  const invoke = async (step: ShutdownStep) => {
    try { await step.run(); }
    catch { throw new Error(`Shutdown step failed: ${step.name}`); }
  };
  return {
    isStopping: () => stopping,
    shutdown(signal: string): Promise<void> {
      if (pending) return pending;
      stopping = true;
      log(`Received ${signal}; draining backend work.`);
      // Keep this referenced: a stuck promise alone does not keep Node alive.
      const deadline = setTimeout(() => {
        log('Backend shutdown deadline exceeded; forcing exit with unfinished work.');
        try { options.forceClose(); } catch { /* Exit still must happen. */ }
        finish(1);
      }, options.timeoutMs ?? shutdownTimeoutMs());
      pending = (async () => {
        // Invoke every stop synchronously before awaiting any drain. Pollers and
        // incoming traffic must stop even if another component takes time.
        const drained = await Promise.allSettled(options.drains.map(invoke));
        if (terminal) return;
        if (drained.some(result => result.status === 'rejected')) {
          throw new Error('Backend work did not drain safely');
        }
        for (const resource of options.resources) {
          if (terminal) return;
          await invoke(resource);
        }
        if (terminal) return;
        log('Backend shutdown complete.');
        finish(0);
      })().catch((error: Error) => {
        if (terminal) return;
        log(error.message);
        try { options.forceClose(); } catch { /* Exit still must happen. */ }
        finish(1);
      }).finally(() => { clearTimeout(deadline); });
      return pending;
    },
  };
}

export function installShutdownSignals(shutdown: (signal: string) => Promise<void>) {
  const term = () => { void shutdown('SIGTERM'); };
  const interrupt = () => { void shutdown('SIGINT'); };
  process.on('SIGTERM', term);
  process.on('SIGINT', interrupt);
  return () => {
    process.off('SIGTERM', term);
    process.off('SIGINT', interrupt);
  };
}

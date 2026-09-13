import { monitorEventLoopDelay } from 'node:perf_hooks';

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const startedAt = new Date();
let lucyRequests = 0;
let lucyFailures = 0;
let lucyTotalLatencyMs = 0;
let lucyMaxLatencyMs = 0;

export function recordLucyRequest(latencyMs: number, success: boolean) {
  lucyRequests += 1;
  if (!success) lucyFailures += 1;
  lucyTotalLatencyMs += latencyMs;
  lucyMaxLatencyMs = Math.max(lucyMaxLatencyMs, latencyMs);
}

export function runtimeMetrics() {
  const memory = process.memoryUsage();
  const nanosecondsToMs = (value: number) => Number.isFinite(value) ? Math.round(value / 1e6) : 0;
  return {
    instance: process.env.RAILWAY_REPLICA_ID || process.env.HOSTNAME || 'local',
    pid: process.pid,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: {
      rss: Math.round(memory.rss / 1048576),
      heapUsed: Math.round(memory.heapUsed / 1048576),
      heapTotal: Math.round(memory.heapTotal / 1048576),
      external: Math.round(memory.external / 1048576),
    },
    eventLoopDelayMs: {
      mean: nanosecondsToMs(eventLoop.mean),
      p95: nanosecondsToMs(eventLoop.percentile(95)),
      p99: nanosecondsToMs(eventLoop.percentile(99)),
      max: nanosecondsToMs(eventLoop.max),
    },
    lucy: {
      requests: lucyRequests,
      failures: lucyFailures,
      averageLatencyMs: lucyRequests ? Math.round(lucyTotalLatencyMs / lucyRequests) : 0,
      maxLatencyMs: Math.round(lucyMaxLatencyMs),
    },
  };
}

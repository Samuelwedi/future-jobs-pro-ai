import { monitorEventLoopDelay } from 'node:perf_hooks';

const startedAt = new Date();
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

type LucyStats = { requests: number; failures: number; totalLatencyMs: number; maxLatencyMs: number };
const lucy: LucyStats = { requests: 0, failures: 0, totalLatencyMs: 0, maxLatencyMs: 0 };

const ms = (nanoseconds: number) => Math.round(nanoseconds / 1e6);

export function recordLucyRequest(latencyMs: number, failed: boolean) {
  lucy.requests += 1;
  lucy.failures += failed ? 1 : 0;
  lucy.totalLatencyMs += latencyMs;
  lucy.maxLatencyMs = Math.max(lucy.maxLatencyMs, latencyMs);
}

export function runtimeMetrics() {
  const memory = process.memoryUsage();
  return {
    instance: process.env.INSTANCE_ID || process.env.RAILWAY_REPLICA_ID || 'local',
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
      mean: ms(eventLoop.mean),
      p95: ms(eventLoop.percentile(95)),
      p99: ms(eventLoop.percentile(99)),
      max: ms(eventLoop.max),
    },
    lucy: {
      requests: lucy.requests,
      failures: lucy.failures,
      averageLatencyMs: lucy.requests ? Math.round(lucy.totalLatencyMs / lucy.requests) : 0,
      maxLatencyMs: lucy.maxLatencyMs,
    },
  };
}

import crypto from 'node:crypto';
import { pool, checkDatabaseHealth, databasePoolStats } from '../config/database';
import { runtimeMetrics } from '../observability/runtimeMetrics';

type Severity = 'info' | 'warning' | 'critical';
type IncidentInput = { component: string; severity: Severity; summary: string; details?: Record<string, unknown> };

let monitorTimer: NodeJS.Timeout | undefined;
let consecutiveUnhealthy = 0;

function fingerprint(input: IncidentInput): string {
  return crypto.createHash('sha256').update(`${input.component}:${input.summary}`).digest('hex');
}

export async function reportSystemIncident(input: IncidentInput) {
  const key = fingerprint(input);
  const result = await pool.query(
    `INSERT INTO system_incidents (fingerprint, component, severity, summary, details)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fingerprint) WHERE status <> 'resolved'
     DO UPDATE SET occurrences = system_incidents.occurrences + 1,
                   last_seen_at = NOW(), severity = EXCLUDED.severity,
                   details = EXCLUDED.details
     RETURNING *`,
    [key, input.component, input.severity, input.summary, input.details || {}],
  );
  return result.rows[0];
}

export async function collectDiagnosticSnapshot() {
  const dbHealthy = await checkDatabaseHealth();
  const metrics = { databasePool: databasePoolStats(), runtime: runtimeMetrics() };
  const status = dbHealthy ? 'healthy' : 'unhealthy';
  await pool.query(
    `INSERT INTO diagnostic_snapshots (source, status, metrics) VALUES ('lucy-core', $1, $2)`,
    [status, metrics],
  );
  return { status, metrics };
}

async function runSafeHousekeeping() {
  const retentionDays = Math.max(1, Number.parseInt(process.env.DIAGNOSTIC_RETENTION_DAYS || '30', 10));
  await pool.query(`DELETE FROM diagnostic_snapshots WHERE captured_at < NOW() - ($1 * INTERVAL '1 day')`, [retentionDays]);
  await pool.query('DELETE FROM api_idempotency_keys WHERE expires_at < NOW()');
}

async function monitorTick() {
  try {
    const snapshot = await collectDiagnosticSnapshot();
    consecutiveUnhealthy = snapshot.status === 'healthy' ? 0 : consecutiveUnhealthy + 1;
    const eventLoopP99 = snapshot.metrics.runtime.eventLoopDelayMs.p99;
    const memoryRss = snapshot.metrics.runtime.memoryMb.rss;
    const poolWaiting = snapshot.metrics.databasePool.waiting;

    if (consecutiveUnhealthy >= 2) {
      await reportSystemIncident({ component: 'database', severity: 'critical', summary: 'Database readiness checks are failing', details: snapshot.metrics });
    }
    if (poolWaiting > Number(process.env.LUCY_DB_WAITING_THRESHOLD || 5)) {
      await reportSystemIncident({ component: 'database', severity: 'warning', summary: 'Database connection waiters exceeded threshold', details: snapshot.metrics });
    }
    if (eventLoopP99 > Number(process.env.LUCY_EVENT_LOOP_P99_MS || 250)) {
      await reportSystemIncident({ component: 'runtime', severity: 'warning', summary: 'Event loop delay exceeded threshold', details: snapshot.metrics });
    }
    if (memoryRss > Number(process.env.LUCY_MEMORY_RSS_MB || 1024)) {
      await reportSystemIncident({ component: 'runtime', severity: 'warning', summary: 'Process memory exceeded threshold', details: snapshot.metrics });
    }
    await runSafeHousekeeping();
  } catch (error: any) {
    console.error('Lucy reliability monitor failed:', error?.message || error);
  }
}

export function startLucyReliabilityMonitor() {
  if (process.env.LUCY_RELIABILITY_MONITOR !== 'true' || monitorTimer) return;
  const intervalMs = Math.max(15000, Number.parseInt(process.env.LUCY_DIAGNOSTIC_INTERVAL_MS || '60000', 10));
  monitorTimer = setInterval(() => void monitorTick(), intervalMs);
  monitorTimer.unref();
  void monitorTick();
}

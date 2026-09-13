#!/usr/bin/env node
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const target = new URL(process.env.TARGET_URL || 'http://127.0.0.1:8080');
const remote = !['localhost', '127.0.0.1'].includes(target.hostname);
if (remote && process.env.ALLOW_REMOTE_LOAD_TEST !== 'YES') throw new Error('Remote tests require an isolated staging target and ALLOW_REMOTE_LOAD_TEST=YES.');

const vus = Math.min(10_000, Math.max(1, Number(process.env.VUS || 100)));
const durationSeconds = Math.min(28_800, Math.max(10, Number(process.env.DURATION_SECONDS || 7200)));
const sampleSeconds = Math.max(5, Number(process.env.SAMPLE_SECONDS || 30));
const token = process.env.AUTH_TOKEN || '';
const output = process.env.REPORT_FILE || `soak-${Date.now()}.jsonl`;
const path = process.env.TEST_PATH || '/api/health';
const maxErrorRate = Number(process.env.MAX_ERROR_RATE || 0.01);
const maxP95Ms = Number(process.env.MAX_P95_MS || 1000);
const deadline = Date.now() + durationSeconds * 1000;
const samples = [];
let interval = { requests: 0, errors: 0, latencies: [] };
let totalRequests = 0;
let totalErrors = 0;
let stopped = false;

function percentile(values, ratio) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return Math.round(values[Math.min(values.length - 1, Math.floor(values.length * ratio))]);
}

async function worker() {
  while (!stopped && Date.now() < deadline) {
    const start = performance.now();
    let ok = false;
    try {
      const response = await fetch(new URL(path, target), {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(Number(process.env.REQUEST_TIMEOUT_MS || 10_000)),
      });
      await response.arrayBuffer();
      ok = response.status >= 200 && response.status < 400;
    } catch {}
    const latency = performance.now() - start;
    totalRequests += 1;
    interval.requests += 1;
    if (!ok) { totalErrors += 1; interval.errors += 1; }
    if (interval.latencies.length < 100_000) interval.latencies.push(latency);
    await delay(Number(process.env.THINK_TIME_MS || 50));
  }
}

async function monitor() {
  while (!stopped && Date.now() < deadline) {
    await delay(sampleSeconds * 1000);
    const current = interval;
    interval = { requests: 0, errors: 0, latencies: [] };
    let health = null;
    try {
      const response = await fetch(new URL('/api/health', target), { signal: AbortSignal.timeout(5000) });
      health = await response.json();
    } catch {}
    const row = {
      at: new Date().toISOString(),
      requests: current.requests,
      rps: Number((current.requests / sampleSeconds).toFixed(2)),
      errorRate: Number((current.errors / Math.max(1, current.requests)).toFixed(5)),
      p95Ms: percentile(current.latencies, .95),
      p99Ms: percentile(current.latencies, .99),
      health,
    };
    samples.push(row);
    fs.appendFileSync(output, `${JSON.stringify(row)}\n`);
    console.log(JSON.stringify(row));
    const poolWaiting = Number(health?.databasePool?.waiting || 0);
    if (row.errorRate > maxErrorRate || row.p95Ms > maxP95Ms || poolWaiting > Number(process.env.MAX_DB_WAITING || 5)) {
      stopped = true;
      console.error('Safety threshold exceeded; stopping the soak test.');
    }
  }
}

await Promise.all([monitor(), ...Array.from({ length: vus }, worker)]);
const starts = new Set(samples.map(item => item.health?.runtime?.startedAt).filter(Boolean));
const summary = { target: target.origin, path, vus, durationSeconds, totalRequests, totalErrors, errorRate: totalErrors / Math.max(1, totalRequests), observedProcessStarts: [...starts], probableRestarts: Math.max(0, starts.size - 1), reportFile: output };
console.log(JSON.stringify(summary, null, 2));
if (stopped || summary.probableRestarts > 0) process.exitCode = 1;

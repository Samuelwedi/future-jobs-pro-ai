// Exercise the real compiled production entry point, HTTP/Socket.IO and Lucy
// worker. Every persistence/provider boundary is an in-memory fake.
const Module = require('node:module');
const http = require('node:http');
const express = require('express');
const send = (event, details = {}) => process.send?.({ event, ...details });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const provider = deferred(), request = deferred(), socketWork = deferred(), access = deferred();
let closed = false, claimed = false, token, actorReads = 0;
const pool = {
  async query(sql, params) {
    if (closed) { send('query-after-close'); throw Error('Database closed early'); }
    if (sql.includes('WITH candidate AS')) {
      if (claimed) return { rows: [], rowCount: 0 };
      claimed = true; token = params[0];
      return { rows: [{ id: 'work', user_id: 'user', company_id: 'company', actor_role: 'boss', mode: 'ai_research', prompt: 'Test' }], rowCount: 1 };
    }
    if (sql.includes('SELECT id FROM lucy_background_work')) return { rows: [{ id: 'work' }], rowCount: 1 };
    if (sql.includes("status='failed'") && params?.[0] === 'work') send('work-failed');
    if (sql.includes('status=$4')) send('work-published');
    if (sql === 'REQUEST COMPLETE') send('request-query');
    if (sql.includes('FROM chat_rooms')) return { rows: [{ member: true, company_id: 'company' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  },
  async end() { send('database-close'); if (process.env.TEST_HANG_DB) await new Promise(() => {}); closed = true; },
  connect() { throw Error('Unexpected real database connection'); },
};
const actor = { id: 'user', companyId: 'company', role: 'boss', subscriptionAccess: true };
const loadSubscriptionActor = async () => {
  actorReads++;
  if (process.env.TEST_ACCESS_RACE && actorReads === 2) { send('access-pending'); await access.promise; }
  return actor;
};
const lucyRoutes = express.Router();
lucyRoutes.get('/test-drain', async (_req, res) => {
  res.once('close', () => { if (!res.writableFinished) send('request-aborted'); });
  send('request-pending'); await request.promise;
  await pool.query('REQUEST COMPLETE'); res.json({ success: true });
});
const originalLoad = Module._load;
const redisClients = [];
function redisClient() {
  const number = redisClients.length;
  const client = { isOpen: false, isReady: false,
    on() { return this; }, duplicate: redisClient,
    async connect() { this.isOpen = true; if (process.env.TEST_REDIS_CONNECTING) { send('redis-pending'); await new Promise(() => {}); } this.isReady = true; return this; },
    async close() { send('redis-close', { number }); this.isOpen = false; this.isReady = false; },
    destroy() { send('redis-destroy', { number }); this.isOpen = false; this.isReady = false; },
  };
  redisClients.push(client); return client;
}
Module._load = function(name, parent, isMain) {
  if (/config\/database$/.test(name)) return { pool, checkDatabaseHealth: async () => true, databasePoolStats: () => ({}) };
  if (/middleware\/trialMiddleware$/.test(name)) return { loadSubscriptionActor, hasCompanyEntitlement: () => true, subscriptionGate: (_req, _res, next) => next() };
  if (/services\/operationsCore$/.test(name)) return { runDueReports: async () => {} };
  if (/services\/chatService$/.test(name)) return { saveMessage: async () => { send('socket-pending'); await socketWork.promise; await pool.query('SOCKET COMPLETE'); send('socket-query'); return {}; } };
  if (/routes\/lucyJarvisRoutes$/.test(name)) return { __esModule: true, default: lucyRoutes, runLucyBackgroundResearch: async () => {
    send('provider-pending'); await provider.promise; send('provider-returned'); return { text: 'Must not be published after shutdown' };
  } };
  if (/routes\//.test(name) && parent?.filename.endsWith('/dist/index.js')) return express.Router();
  if (name === 'redis') return { createClient: redisClient };
  if (name === '@socket.io/redis-adapter') return { createAdapter: () => require('socket.io-adapter').Adapter };
  return originalLoad.call(this, name, parent, isMain);
};
const originalCreateServer = http.createServer;
http.createServer = function(...args) {
  const server = originalCreateServer.apply(this, args);
  server.once('listening', () => send('listening', { port: server.address().port }));
  return server;
};
const originalLog = console.log;
console.log = (...args) => {
  if (String(args[0]).startsWith('Received SIG')) send('stopping');
  if (String(args[0]).includes('shutdown deadline exceeded')) send('forced');
  originalLog(...args);
};
process.on('message', message => {
  if (message === 'release-provider') provider.resolve();
  if (message === 'release-request') request.resolve();
  if (message === 'release-socket') socketWork.resolve();
  if (message === 'release-access') access.resolve();
});
require('../../dist/index');

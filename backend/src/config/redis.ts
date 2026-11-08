import { createClient } from 'redis';

export type SharedRedis = ReturnType<typeof createClient>;
const clients = new Set<SharedRedis>();
let closing = false;
let closePromise: Promise<void> | undefined;

/** Register before connecting so shutdown also owns an unfinished connection. */
export function trackSharedRedisClient(client: SharedRedis): SharedRedis {
  if (closing) throw new Error('Redis is shutting down');
  clients.add(client);
  return client;
}

export function closeSharedRedisClients(): Promise<void> {
  if (closePromise) return closePromise;
  closing = true;
  closePromise = Promise.all([...clients].map(async client => {
    if (!client.isOpen) return;
    if (client.isReady) await client.close();
    else client.destroy(); // Stop reconnecting clients without awaiting readiness.
  })).then(() => { clients.clear(); });
  return closePromise;
}

export async function createSharedRedisClient(): Promise<SharedRedis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url || closing) return null;
  const client = trackSharedRedisClient(createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: (retries) => Math.min(retries * 100, 3000) } }));
  client.on('error', (error) => console.error('Redis connection error:', error.message));
  try { await client.connect(); }
  catch (error) {
    if (client.isOpen) client.destroy();
    clients.delete(client);
    throw error;
  }
  if (closing) return null;
  return client;
}

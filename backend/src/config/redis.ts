import { createClient } from 'redis';

export type SharedRedis = ReturnType<typeof createClient>;

export async function createSharedRedisClient(): Promise<SharedRedis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const client = createClient({ url, socket: { connectTimeout: 5000, reconnectStrategy: (retries) => Math.min(retries * 100, 3000) } });
  client.on('error', (error) => console.error('Redis connection error:', error.message));
  await client.connect();
  return client;
}

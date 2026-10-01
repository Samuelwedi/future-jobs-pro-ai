// ============================================
// DATABASE CONNECTION
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// On Railway, use the DATABASE_URL with SSL; locally, use individual env vars
const integerEnv = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sslEnabled = process.env.DB_SSL
  ? process.env.DB_SSL.toLowerCase() !== 'false'
  : Boolean(process.env.DATABASE_URL);

const poolConfig: PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'futurejobspro_samuel',
    };

export const pool = new Pool({
  ...poolConfig,
  max: integerEnv('DB_POOL_MAX', 20),
  idleTimeoutMillis: integerEnv('DB_IDLE_TIMEOUT_MS', 30000),
  connectionTimeoutMillis: integerEnv('DB_CONNECT_TIMEOUT_MS', 5000),
  query_timeout: integerEnv('DB_QUERY_TIMEOUT_MS', 15000),
  statement_timeout: integerEnv('DB_STATEMENT_TIMEOUT_MS', 15000),
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL – Future Jobs Pro AI by Samuel B.');
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err);
});

export const databasePoolStats = () => ({
  total: pool.totalCount,
  idle: pool.idleCount,
  waiting: pool.waitingCount,
  max: integerEnv('DB_POOL_MAX', 20),
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Query took ${duration}ms`);
    }
    return res;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

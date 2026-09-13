// ============================================
// DATABASE CONNECTION
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// On Railway, use the DATABASE_URL with SSL; locally, use individual env vars
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
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
  max: Math.max(2, parseInt(process.env.DB_POOL_MAX || '20', 10)),
  idleTimeoutMillis: Math.max(1000, parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10)),
  connectionTimeoutMillis: Math.max(500, parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10)),
  statement_timeout: Math.max(1000, parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '30000', 10)),
  query_timeout: Math.max(1000, parseInt(process.env.DB_QUERY_TIMEOUT_MS || '35000', 10)),
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL – Future Jobs Pro AI by Samuel B.');
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err);
  // pg evicts a failed idle client. Keep the healthy process available while
  // readiness reports database failure to the platform load balancer.
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

export const databasePoolStats = () => ({
  total: pool.totalCount,
  idle: pool.idleCount,
  waiting: pool.waitingCount,
  max: Math.max(2, parseInt(process.env.DB_POOL_MAX || '20', 10)),
});

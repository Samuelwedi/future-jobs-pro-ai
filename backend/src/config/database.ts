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
      password: process.env.DB_PASSWORD || 'SamuelDB2024!',
      database: process.env.DB_NAME || 'futurejobspro_samuel',
    };

export const pool = new Pool({
  ...poolConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL – Future Jobs Pro AI by Samuel B.');
});

pool.on('error', (err) => {
  console.error('❌ Database error:', err);
  process.exit(-1);
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
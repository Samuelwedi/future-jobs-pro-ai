const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function setup() {
  try {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Core tables
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('boss', 'manager', 'employee')),
        full_name VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        company_id UUID REFERENCES companies(id),
        kiosk_enabled BOOLEAN DEFAULT false,
        department VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID REFERENCES companies(id),
        name VARCHAR(255) NOT NULL,
        client_name VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS time_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        project_id UUID REFERENCES projects(id),
        clock_in TIMESTAMP WITH TIME ZONE,
        clock_out TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id),
        project_id UUID REFERENCES projects(id),
        title VARCHAR(255),
        start_time TIMESTAMP WITH TIME ZONE,
        end_time TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        shift_id UUID REFERENCES shifts(id),
        assigned_to UUID REFERENCES users(id),
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_insights (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        target_user_id UUID REFERENCES users(id),
        insight_type VARCHAR(50),
        content TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Integration and sync tables
      CREATE TABLE IF NOT EXISTS integrations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID REFERENCES companies(id),
        provider VARCHAR(50),
        access_token TEXT,
        refresh_token TEXT,
        realm_id VARCHAR(255),
        stripe_account_id VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        token_expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sync_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_id UUID REFERENCES companies(id),
        provider VARCHAR(50),
        event_type VARCHAR(100),
        status VARCHAR(50),
        request_data JSONB,
        ai_decision JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    console.log('✅ All tables created successfully.');

    // Insert default company
    const companyResult = await pool.query(
      `INSERT INTO companies (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`,
      ['Samuel Company']
    );
    const companyId = companyResult.rows[0]?.id || null;

    // Insert test boss user (password: Test1234!)
    const hash = await bcrypt.hash('Test1234!', 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, first_name, last_name, company_id)
       VALUES ($1, $2, 'boss', 'Samuel B.', 'Samuel', 'B.', $3)
       ON CONFLICT (email) DO UPDATE SET company_id = $3`,
      ['samuel@test.com', hash, companyId]
    );

    console.log('✅ Test user ready (samuel@test.com / Test1234!).');
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
  } finally {
    await pool.end();
  }
}

setup();
// backend/scripts/computeOfficeCity.js
const { Pool } = require('pg');
const fetch = require('node-fetch');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:fFhIpSkiVKmHhAmQcQoSudrksWdXuGMQ@centerbeam.proxy.rlwy.net:47967/railway';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function getCity(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data.address) {
      return data.address.city || data.address.town || data.address.village || data.address.county || null;
    }
    return null;
  } catch (e) {
    console.error('Geocoding error:', e);
    return null;
  }
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Computing office city for companies...');

    const result = await client.query(`
      SELECT DISTINCT ON (c.id)
        c.id AS company_id,
        te.latitude,
        te.longitude
      FROM companies c
      JOIN users u ON c.id = u.company_id
      JOIN time_entries te ON u.id = te.user_id
      WHERE te.latitude IS NOT NULL AND te.longitude IS NOT NULL
      ORDER BY c.id, te.created_at DESC
    `);

    for (const row of result.rows) {
      if (row.latitude && row.longitude) {
        const city = await getCity(row.latitude, row.longitude);
        if (city) {
          await client.query('UPDATE companies SET office_city = $1 WHERE id = $2', [city, row.company_id]);
          console.log(`✅ Company ${row.company_id}: ${city}`);
        }
      }
    }
    console.log('✅ Done.');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
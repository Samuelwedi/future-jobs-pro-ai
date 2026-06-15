require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // List columns for projects
    const projectsCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'projects' 
      ORDER BY ordinal_position
    `);
    console.log('📁 projects table columns:');
    projectsCols.rows.forEach(col => console.log(`   - ${col.column_name} (${col.data_type})`));

    // List columns for shifts
    const shiftsCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'shifts' 
      ORDER BY ordinal_position
    `);
    console.log('\n📅 shifts table columns:');
    shiftsCols.rows.forEach(col => console.log(`   - ${col.column_name} (${col.data_type})`));

    // List columns for time_entries
    const timeCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'time_entries' 
      ORDER BY ordinal_position
    `);
    console.log('\n⏱️ time_entries table columns:');
    timeCols.rows.forEach(col => console.log(`   - ${col.column_name} (${col.data_type})`));

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
})();
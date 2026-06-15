require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    // Get the demo user id
    const userRes = await pool.query(`SELECT id FROM users WHERE email = 'samuel@test.com'`);
    if (userRes.rows.length === 0) {
      console.error('Demo user not found');
      return;
    }
    const userId = userRes.rows[0].id;
    console.log('Demo user ID:', userId);

    // Check if project exists
    let projectId;
    const existingProject = await pool.query(
      `SELECT id FROM projects WHERE name = 'Main Street Office' AND company_id = $1`,
      ['ed1887d9-3ffd-46e4-b281-338c8ad03a66']
    );
    if (existingProject.rows.length === 0) {
      const insertProject = await pool.query(`
        INSERT INTO projects (id, company_id, name, client_name, status)
        VALUES (gen_random_uuid(), $1, $2, $3, $4)
        RETURNING id
      `, ['ed1887d9-3ffd-46e4-b281-338c8ad03a66', 'Main Street Office', 'Acme Corp', 'active']);
      projectId = insertProject.rows[0].id;
      console.log('Inserted new project, ID:', projectId);
    } else {
      projectId = existingProject.rows[0].id;
      console.log('Project already exists, ID:', projectId);
    }

    // Check if shift already exists for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const existingShift = await pool.query(
      `SELECT id FROM shifts WHERE user_id = $1 AND project_id = $2 AND start_time >= $3 AND start_time < $4`,
      [userId, projectId, today, tomorrow]
    );
    if (existingShift.rows.length === 0) {
      const startTime = new Date();
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date();
      endTime.setHours(17, 0, 0, 0);
      const insertShift = await pool.query(`
        INSERT INTO shifts (id, user_id, project_id, start_time, end_time)
        VALUES (gen_random_uuid(), $1, $2, $3, $4)
        RETURNING id
      `, [userId, projectId, startTime, endTime]);
      console.log('Inserted shift, ID:', insertShift.rows[0].id);
    } else {
      console.log('Shift already exists, ID:', existingShift.rows[0].id);
    }

    // Check if active time entry exists (no clock_out)
    const existingTime = await pool.query(
      `SELECT id FROM time_entries WHERE user_id = $1 AND project_id = $2 AND clock_out IS NULL`,
      [userId, projectId]
    );
    if (existingTime.rows.length === 0) {
      const insertTime = await pool.query(`
        INSERT INTO time_entries (id, user_id, project_id, clock_in, company_id)
        VALUES (gen_random_uuid(), $1, $2, NOW() - INTERVAL '2 hours', $3)
        RETURNING id
      `, [userId, projectId, 'ed1887d9-3ffd-46e4-b281-338c8ad03a66']);
      console.log('Inserted time entry, ID:', insertTime.rows[0].id);
    } else {
      console.log('Active time entry already exists, ID:', existingTime.rows[0].id);
    }

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
})();
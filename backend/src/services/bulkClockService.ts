import { pool } from '../config/database';

const invalid = (status: number, message: string) => Object.assign(new Error(message), { status });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lock employees in a stable order, then commit time and GPS evidence together.
async function clockIn(actorId: string, input: any, mode: 'bulk' | 'self' | 'kiosk' | 'public-kiosk') {
  const { userIds, projectId, latitude, longitude } = input || {};
  const hasLocation = latitude != null || longitude != null;
  if (!Array.isArray(userIds) || !userIds.length || userIds.length > 250 ||
      userIds.some(id => typeof id !== 'string' || !uuid.test(id)) ||
      typeof projectId !== 'string' || !uuid.test(projectId)) {
    throw invalid(400, 'Provide a project and 1–250 valid employee IDs');
  }
  if ((!mode.endsWith('kiosk') || hasLocation) && (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180)) {
    throw invalid(400, 'Valid latitude and longitude are required');
  }
  const ids = [...new Set<string>(userIds.map(id => id.toLowerCase()))];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Include the actor in the same ordered lock to avoid overlapping-batch deadlocks.
    const members = await client.query(
      'SELECT id, company_id, role, is_active FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [[...new Set([...ids, actorId])].sort()],
    );
    const actor = members.rows.find(row => String(row.id) === actorId);
    if (!actor || actor.is_active === false || (mode !== 'self' && mode !== 'public-kiosk' && !(mode === 'kiosk' ? ['boss', 'manager', 'admin'] : ['boss', 'manager']).includes(String(actor.role).toLowerCase()))) {
      throw invalid(403, 'Manager access is required');
    }
    if (ids.some(id => !members.rows.some(row => String(row.id) === id && row.company_id === actor.company_id && row.is_active !== false))) {
      throw invalid(403, 'All employees must be active members of your company');
    }
    if (mode === 'self' && (ids.length !== 1 || ids[0] !== actorId)) throw invalid(403, 'Personal clock-in must use your account');
    if (mode.endsWith('kiosk')) {
      const eligible = await client.query(`SELECT u.id, to_jsonb(c) company FROM users u JOIN companies c ON c.id=u.company_id
        WHERE u.id=$1 AND u.pin=$2 AND COALESCE((to_jsonb(c)->>'kiosk_enabled')::boolean,FALSE)=TRUE FOR SHARE OF c`, [ids[0],input.pin]);
      if (ids.length !== 1 || !eligible.rows.length) throw invalid(403, 'Kiosk or PIN is no longer available');
      if (mode === 'public-kiosk') {
        const company = eligible.rows[0].company;
        const status = String(company.subscription_status || '').toLowerCase();
        const end = company.subscription_current_period_end || company.subscription_expires_at;
        if (actor.company_id !== input.companyId || !['active','trialing'].includes(status) ||
            (end ? !(new Date(end).getTime() > Date.now()) : status !== 'active')) throw invalid(402, 'This kiosk requires an active subscription');
      }
    }
    const project = await client.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2 FOR SHARE', [projectId, actor.company_id]);
    if (!project.rows.length) throw invalid(403, 'Project must belong to your company');
    const results = [];
    for (const userId of ids) {
      const active = await client.query('SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL', [userId]);
      if (active.rows.length) {
        results.push({ userId, success: false, message: 'Already clocked in' });
        continue;
      }
      const created = await client.query(
        `INSERT INTO time_entries (user_id, project_id, company_id, clock_in, latitude, longitude, clock_in_latitude, clock_in_longitude, created_at, status)
         VALUES ($1, $2, $5, NOW(), $3, $4, $3, $4, NOW(), 'active') RETURNING *`,
        [userId, projectId, latitude ?? null, longitude ?? null, actor.company_id],
      );
      if (hasLocation) await client.query(
        `INSERT INTO gps_tracking (user_id, time_entry_id, project_id, latitude, longitude, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, created.rows[0].id, projectId, latitude, longitude],
      );
      results.push({ userId, success: true, timeEntryId: created.rows[0].id, entry: created.rows[0] });
    }
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function bulkClockIn(actorId: string, input: any) { return clockIn(actorId,input,'bulk'); }
export async function personalClockIn(actorId: string, input: any) {
  const result = (await clockIn(actorId,{...input,userIds:[actorId]},'self'))[0];
  if (!result.success) throw invalid(409, result.message || 'Already clocked in');
  return result.entry;
}
export async function kioskClockIn(actorId: string, userId: string, input: any) {
  const result = (await clockIn(actorId,{...input,userIds:[userId]},'kiosk'))[0];
  if (!result.success) throw invalid(409, result.message || 'Already clocked in');
  return result.entry;
}

export async function publicKioskClockIn(userId: string, input: any) {
  const result=(await clockIn(userId,{...input,userIds:[userId]},'public-kiosk'))[0];
  if (!result.success) throw invalid(409,result.message || 'Already clocked in');
  return result.entry;
}

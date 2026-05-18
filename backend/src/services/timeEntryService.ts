import { pool } from '../config/database';
import { recordUserEvent } from './adaptiveAIService';

export async function clockIn(userId: string, projectId: string, latitude: number, longitude: number) {
  const result = await pool.query(
    `INSERT INTO time_entries (user_id, project_id, clock_in, clock_in_latitude, clock_in_longitude, status)
     VALUES ($1, $2, NOW(), $3, $4, 'active')
     RETURNING *`,
    [userId, projectId, latitude, longitude]
  );
  const entry = result.rows[0];
  await recordUserEvent({
    userId,
    eventType: 'clock_in',
    eventData: { projectId, timeEntryId: entry.id },
    latitude,
    longitude,
  });
  return entry;
}

export async function clockOut(userId: string, timeEntryId: string, latitude: number, longitude: number) {
  const result = await pool.query(
    `UPDATE time_entries
     SET clock_out = NOW(), clock_out_latitude = $1, clock_out_longitude = $2, status = 'completed'
     WHERE id = $3 AND user_id = $4
     RETURNING *`,
    [latitude, longitude, timeEntryId, userId]
  );
  const entry = result.rows[0];
  if (entry) {
    await recordUserEvent({
      userId,
      eventType: 'clock_out',
      eventData: { projectId: entry.project_id, timeEntryId: entry.id },
      latitude,
      longitude,
    });
  }
  return entry;
}
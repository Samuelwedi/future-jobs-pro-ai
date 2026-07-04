// ============================================
// GPS SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';

export interface GPSPoint {
  userId: string;
  timeEntryId: string;
  projectId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
}

interface GeofenceStatus {
  geofenceStatus: 'inside' | 'outside' | 'unknown';
  isMoving: boolean;
}

// ---------------------------------------------
// Record a GPS point for a time entry
// ---------------------------------------------
export async function recordGPSPoint(point: GPSPoint): Promise<GeofenceStatus & { pointId: string }> {
  const { userId, timeEntryId, projectId, latitude, longitude, accuracy, altitude, speed, heading, batteryLevel } = point;

  // Check if the user is inside the project's geofence (if any)
  const projectRes = await pool.query(
    'SELECT geofence_lat, geofence_lng, geofence_radius FROM projects WHERE id = $1',
    [projectId]
  );
  const project = projectRes.rows[0];
  let geofenceStatus: 'inside' | 'outside' | 'unknown' = 'unknown';
  if (project && project.geofence_lat && project.geofence_lng && project.geofence_radius) {
    const distance = calculateDistance(
      latitude, longitude,
      project.geofence_lat, project.geofence_lng
    );
    geofenceStatus = distance <= project.geofence_radius ? 'inside' : 'outside';
  }

  // Detect if moving (speed > 1 m/s)
  const isMoving = speed !== undefined && speed > 1;

  const result = await pool.query(
    `INSERT INTO gps_tracking
     (user_id, time_entry_id, project_id, latitude, longitude, accuracy, altitude, speed, heading, battery_level, geofence_status, is_moving)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [userId, timeEntryId, projectId, latitude, longitude, accuracy || null, altitude || null, speed || null, heading || null, batteryLevel || null, geofenceStatus, isMoving]
  );

  return {
    pointId: result.rows[0].id,
    geofenceStatus,
    isMoving,
  };
}

// ---------------------------------------------
// Generate breadcrumb trail (GPS points for a time entry)
// ---------------------------------------------
export async function generateBreadcrumbTrail(timeEntryId: string, userId?: string): Promise<{ points: any[] }> {
  let query = 'SELECT * FROM gps_tracking WHERE time_entry_id = $1';
  const params: any[] = [timeEntryId];
  if (userId) {
    query += ' AND user_id = $2';
    params.push(userId);
  }
  query += ' ORDER BY timestamp ASC';
  const result = await pool.query(query, params);
  return { points: result.rows };
}

// ---------------------------------------------
// Get arrival confidence (percentage of time spent inside geofence)
// ---------------------------------------------
export async function getArrivalConfidence(timeEntryId: string): Promise<{ confidence: number; insideCount: number; totalCount: number }> {
  const result = await pool.query(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN geofence_status = 'inside' THEN 1 ELSE 0 END) as inside
     FROM gps_tracking
     WHERE time_entry_id = $1`,
    [timeEntryId]
  );
  const total = parseInt(result.rows[0].total) || 0;
  const inside = parseInt(result.rows[0].inside) || 0;
  const confidence = total > 0 ? (inside / total) * 100 : 0;
  return { confidence, insideCount: inside, totalCount: total };
}

// ---------------------------------------------
// Get active employee locations for a company
// ---------------------------------------------
export async function getActiveEmployeeLocations(companyId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name,
            g.latitude, g.longitude, g.timestamp,
            g.geofence_status, g.is_moving,
            p.name as project_name
     FROM users u
     JOIN time_entries te ON te.user_id = u.id AND te.clock_out IS NULL
     JOIN gps_tracking g ON g.time_entry_id = te.id
     JOIN projects p ON p.id = te.project_id
     WHERE u.company_id = $1
     ORDER BY g.timestamp DESC`,
    [companyId]
  );
  // Keep only the latest point per user
  const latestByUser = new Map();
  result.rows.forEach(row => {
    if (!latestByUser.has(row.id) || new Date(row.timestamp) > new Date(latestByUser.get(row.id).timestamp)) {
      latestByUser.set(row.id, row);
    }
  });
  return Array.from(latestByUser.values());
}

// ---------------------------------------------
// Helper: calculate distance between two coordinates (Haversine)
// ---------------------------------------------
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

console.log('🗺️  GPS Service loaded – Future Jobs Pro AI by Samuel B.');
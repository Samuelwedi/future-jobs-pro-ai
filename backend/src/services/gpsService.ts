// ============================================
// GPS TRACKING SERVICE (with Geofence Alerts)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';
import { recordUserEvent } from './adaptiveAIService';
import { sendPushNotification } from './notificationService';

interface GPSPoint {
  userId: string;
  timeEntryId: string;
  projectId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
  timestamp: Date;
  isMoving: boolean;
  geofenceStatus: 'inside' | 'outside' | 'unknown';
}

interface BreadcrumbTrail {
  points: GPSPoint[];
  totalDistance: number;
  totalTime: number;
  startTime: Date;
  endTime: Date;
  averageSpeed: number;
}

// ============================================
// 1. Record a single GPS point
// ============================================
export async function recordGPSPoint(
  point: Omit<GPSPoint, 'timestamp' | 'geofenceStatus' | 'isMoving'>
): Promise<GPSPoint> {

  console.log(`📍 [Samuel B. GPS] Recording point for user ${point.userId}`);

  // Check geofence
  const geofenceStatus = await checkGeofence(point.projectId, point.latitude, point.longitude);
  const isMoving = point.speed ? point.speed > 2 : false;

  // Get the previous geofence status for this time entry
  const previousStatus = await getPreviousGeofenceStatus(point.userId, point.timeEntryId);

  const fullPoint: GPSPoint = {
    ...point,
    timestamp: new Date(),
    geofenceStatus,
    isMoving,
  };

  // Insert into database
  await pool.query(
    `INSERT INTO gps_tracking (user_id, time_entry_id, project_id, latitude, longitude, accuracy,
      altitude, speed, heading, battery_level, is_moving, geofence_status, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      fullPoint.userId, fullPoint.timeEntryId, fullPoint.projectId,
      fullPoint.latitude, fullPoint.longitude, fullPoint.accuracy,
      fullPoint.altitude || null, fullPoint.speed || null, fullPoint.heading || null,
      fullPoint.batteryLevel || null, fullPoint.isMoving, fullPoint.geofenceStatus,
      fullPoint.timestamp
    ]
  );

  // Record event for AI learning
  await recordUserEvent({
    userId: point.userId,
    eventType: 'location_update',
    eventData: { speed: point.speed, geofenceStatus },
    latitude: point.latitude,
    longitude: point.longitude,
  });

  // 🚨 Geofence alert: status changed from previous point
  if (previousStatus && previousStatus !== geofenceStatus && geofenceStatus !== 'unknown') {
    console.log(`🚨 Geofence change: ${previousStatus} → ${geofenceStatus} for user ${point.userId}`);

    const title = geofenceStatus === 'inside'
      ? '📍 Arrived on Site'
      : '🚪 Left Job Site';

    const body = geofenceStatus === 'inside'
      ? 'You have entered the job site area.'
      : 'You have left the job site area.';

    await sendPushNotification(point.userId, title, body, {
      type: 'geofence',
      status: geofenceStatus,
      projectId: point.projectId,
    });
  }

  return fullPoint;
}

// ============================================
// 2. Get previous geofence status for the active time entry
// ============================================
async function getPreviousGeofenceStatus(
  userId: string,
  timeEntryId: string
): Promise<string | null> {
  const result = await pool.query(
    `SELECT geofence_status FROM gps_tracking
     WHERE user_id = $1 AND time_entry_id = $2
     ORDER BY recorded_at DESC LIMIT 1`,
    [userId, timeEntryId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].geofence_status;
}

// ============================================
// 3. Check if coordinates are inside the job site
// ============================================
async function checkGeofence(
  projectId: string,
  latitude: number,
  longitude: number
): Promise<'inside' | 'outside' | 'unknown'> {

  const result = await pool.query(
    `SELECT latitude, longitude FROM projects WHERE id = $1`,
    [projectId]
  );
  if (result.rows.length === 0) return 'unknown';

  const project = result.rows[0];
  if (!project.latitude || !project.longitude) return 'unknown';

  const distance = calculateDistance(latitude, longitude, project.latitude, project.longitude);
  const distanceMeters = distance * 1609.34;
  const GEOFENCE_RADIUS = 100; // metres

  return distanceMeters <= GEOFENCE_RADIUS ? 'inside' : 'outside';
}

// ============================================
// 4. Generate a full breadcrumb trail
// ============================================
export async function generateBreadcrumbTrail(timeEntryId: string): Promise<BreadcrumbTrail> {

  const result = await pool.query(
    `SELECT * FROM gps_tracking WHERE time_entry_id = $1 ORDER BY recorded_at ASC`,
    [timeEntryId]
  );
  const points: GPSPoint[] = result.rows;

  if (points.length === 0) {
    return {
      points: [],
      totalDistance: 0,
      totalTime: 0,
      startTime: new Date(),
      endTime: new Date(),
      averageSpeed: 0,
    };
  }

  let totalDistanceMiles = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistanceMiles += calculateDistance(
      points[i-1].latitude, points[i-1].longitude,
      points[i].latitude, points[i].longitude
    );
  }

  const startTime = new Date(points[0].timestamp);
  const endTime = new Date(points[points.length - 1].timestamp);
  const totalTimeMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
  const averageSpeed = totalTimeMinutes > 0 ? (totalDistanceMiles / totalTimeMinutes) * 60 : 0;

  return { points, totalDistance: totalDistanceMiles, totalTime: totalTimeMinutes, startTime, endTime, averageSpeed };
}

// ============================================
// 5. Arrival confidence (unchanged)
// ============================================
export async function getArrivalConfidence(timeEntryId: string): Promise<{ score: number; evidence: string[] }> {

  const trail = await generateBreadcrumbTrail(timeEntryId);
  if (trail.points.length < 5) {
    return { score: 0, evidence: ['Insufficient GPS data'] };
  }

  let confidence = 0;
  const evidence: string[] = [];

  const insidePoints = trail.points.filter(p => p.geofenceStatus === 'inside');
  if (insidePoints.length > 0) {
    const insidePct = (insidePoints.length / trail.points.length) * 100;
    confidence += Math.min(insidePct * 0.5, 50);
    evidence.push(`✅ Inside geofence ${insidePct.toFixed(0)}% of the time`);
  } else {
    evidence.push('❌ Never entered geofence');
  }

  let arrivalDetected = false;
  for (let i = 1; i < trail.points.length; i++) {
    if (trail.points[i-1].isMoving && !trail.points[i].isMoving && trail.points[i].geofenceStatus === 'inside') {
      arrivalDetected = true;
      break;
    }
  }
  if (arrivalDetected) { confidence += 30; evidence.push('✅ Arrival pattern detected'); }

  if (insidePoints.length >= 2) {
    const onsiteMin = (new Date(insidePoints[insidePoints.length-1].timestamp).getTime() -
                       new Date(insidePoints[0].timestamp).getTime()) / 60000;
    if (onsiteMin > 15) { confidence += 20; evidence.push(`✅ Spent ${onsiteMin.toFixed(0)} min on site`); }
  }

  return { score: Math.min(confidence, 100), evidence };
}

// ============================================
// 6. Get active employee locations (unchanged)
// ============================================
export async function getActiveEmployeeLocations(companyId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT DISTINCT ON (gt.user_id)
       gt.user_id, u.first_name, u.last_name, gt.latitude, gt.longitude,
       gt.recorded_at as last_update, gt.geofence_status, gt.is_moving,
       p.name as current_project, p.id as project_id
     FROM gps_tracking gt
     JOIN users u ON gt.user_id = u.id
     LEFT JOIN projects p ON gt.project_id = p.id
     WHERE u.company_id = $1
       AND gt.recorded_at > NOW() - INTERVAL '10 minutes'
       AND EXISTS (SELECT 1 FROM time_entries te WHERE te.user_id = gt.user_id AND te.clock_out IS NULL)
     ORDER BY gt.user_id, gt.recorded_at DESC`,
    [companyId]
  );
  return result.rows;
}

// ============================================
// Helper: Haversine distance (miles)
// ============================================
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

console.log('🗺️  GPS Tracking Service (with geofence alerts) loaded – Future Jobs Pro AI by Samuel B.');
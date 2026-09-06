// ============================================
// GPS ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { pool } from '../config/database';
import {
  recordGPSPoint,
  generateBreadcrumbTrail,
  getArrivalConfidence,
  getActiveEmployeeLocations
} from '../services/gpsService';

const router = express.Router();

// GET /api/gps/employees - manager-safe employee picker for trail history.
router.get('/employees', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const actorResult = await pool.query('SELECT company_id,LOWER(COALESCE(role,\'employee\')) role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE',[decoded.id]);
    const actor = actorResult.rows[0];
    if (!actor) return res.status(401).json({success:false,message:'Not authenticated'});
    const canManage = ['boss','manager','admin'].includes(actor.role);
    const result = await pool.query(
      `SELECT id,first_name,last_name,role FROM users
       WHERE company_id=$1 AND COALESCE(is_active,TRUE)=TRUE AND ($2::boolean OR id=$3)
       ORDER BY first_name,last_name`, [actor.company_id,canManage,decoded.id],
    );
    res.set('Cache-Control','no-store').json({success:true,employees:result.rows});
  } catch (error:any) { res.status(500).json({success:false,message:error.message}); }
});

// GET /api/gps/history?start=&end=&userId= – shifts that contain GPS breadcrumbs
router.get('/history', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const actorResult = await pool.query(
      'SELECT company_id, role FROM users WHERE id = $1',
      [decoded.id]
    );
    const actor = actorResult.rows[0];
    if (!actor?.company_id) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const isManager = ['boss', 'manager', 'admin'].includes(String(actor.role || '').toLowerCase());
    const requestedUserId = req.query.userId ? String(req.query.userId) : undefined;
    const targetUserId = isManager ? requestedUserId : decoded.id;
    const start = req.query.start ? String(req.query.start) : new Date(Date.now() - 30 * 86400000).toISOString();
    const end = req.query.end ? String(req.query.end) : new Date().toISOString();

    const result = await pool.query(
      `SELECT te.id AS time_entry_id, te.user_id, te.project_id, te.clock_in, te.clock_out,
              u.first_name, u.last_name, p.name AS project_name,
              COUNT(g.id)::integer AS point_count,
              MIN(g.timestamp) AS first_gps_at, MAX(g.timestamp) AS last_gps_at
       FROM time_entries te
       JOIN users u ON u.id = te.user_id
       LEFT JOIN projects p ON p.id = te.project_id
       JOIN gps_tracking g ON g.time_entry_id = te.id
       WHERE u.company_id = $1
         AND te.clock_in >= $2::timestamptz
         AND te.clock_in <= $3::timestamptz
         AND ($4::uuid IS NULL OR te.user_id = $4::uuid)
       GROUP BY te.id, te.user_id, te.project_id, te.clock_in, te.clock_out,
                u.first_name, u.last_name, p.name
       ORDER BY te.clock_in DESC
       LIMIT 200`,
      [actor.company_id, start, end, targetUserId || null]
    );
    res.json({ success: true, history: result.rows, start, end });
  } catch (error: any) {
    console.error('GPS history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/gps/update
router.post('/update', async (req: Request, res: Response) => {
  try {
    const { userId, timeEntryId, projectId, latitude, longitude,
            accuracy, altitude, speed, heading, batteryLevel } = req.body;

    if (!userId || !timeEntryId || !projectId || !latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const point = await recordGPSPoint({
      userId, timeEntryId, projectId,
      latitude: parseFloat(latitude), longitude: parseFloat(longitude),
      accuracy: accuracy ? parseFloat(accuracy) : 10,
      altitude: altitude ? parseFloat(altitude) : undefined,
      speed: speed ? parseFloat(speed) : undefined,
      heading: heading ? parseInt(heading) : undefined,
      batteryLevel: batteryLevel ? parseInt(batteryLevel) : undefined,
    });

    res.json({
      success: true,
      geofenceStatus: point.geofenceStatus || 'unknown',
      isMoving: point.isMoving || false,
      message: point.geofenceStatus === 'inside'
        ? '✅ You are at the job site'
        : '⚠️ You are outside the job site'
    });
  } catch (error: any) {
    console.error('❌ GPS update error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to record GPS point' });
  }
});

// GET /api/gps/trail/:timeEntryId
router.get('/trail/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const timeEntryId = Array.isArray(req.params.timeEntryId)
      ? req.params.timeEntryId[0]
      : req.params.timeEntryId;
    if (!timeEntryId) {
      return res.status(400).json({ success: false, message: 'Missing timeEntryId' });
    }

    const decoded = verifyToken(req);
    const access = await pool.query(
      `SELECT te.user_id,u.company_id target_company,a.company_id actor_company,LOWER(COALESCE(a.role,'employee')) actor_role
       FROM time_entries te JOIN users u ON u.id=te.user_id JOIN users a ON a.id=$2 WHERE te.id=$1`,
      [timeEntryId,decoded.id],
    );
    const row=access.rows[0];
    if(!row || String(row.target_company)!==String(row.actor_company)) return res.status(403).json({success:false,message:'GPS trail access denied'});
    if(String(row.user_id)!==String(decoded.id) && !['boss','manager','admin'].includes(row.actor_role)) return res.status(403).json({success:false,message:'Manager access is required'});
    const trail = await generateBreadcrumbTrail(timeEntryId, String(row.user_id));
    res.json({ success: true, trail });
  } catch (error: any) {
    console.error('GPS trail error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/gps/confidence/:timeEntryId
router.get('/confidence/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const confidence = await getArrivalConfidence(req.params.timeEntryId as string);
    res.json({ success: true, ...confidence });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/gps/active/:companyId – Who's working right now
router.get('/active/:companyId', async (req: Request, res: Response) => {
  try {
    const companyId = req.params.companyId as string;

    // Fetch active employees (with clock_out IS NULL) and their latest GPS point
    const result = await pool.query(
      `SELECT DISTINCT ON (te.user_id)
              u.id AS user_id,
              u.first_name,
              u.last_name,
              te.id AS time_entry_id,
              te.clock_in,
              g.latitude,
              g.longitude,
              g.timestamp AS last_gps_time,
              g.is_moving,
              g.geofence_status,
              p.name AS project_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN gps_tracking g ON te.user_id = g.user_id AND te.id = g.time_entry_id
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.clock_out IS NULL
         AND u.company_id = $1
       ORDER BY te.user_id, g.timestamp DESC`,
      [companyId]
    );

    const employees = result.rows.map((row: any) => ({
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      timeEntryId: row.time_entry_id,
      clockIn: row.clock_in,
      latitude: row.latitude,
      longitude: row.longitude,
      lastGpsTime: row.last_gps_time,
      isMoving: row.is_moving || false,
      geofenceStatus: row.geofence_status || 'unknown',
      projectName: row.project_name || 'Unknown',
    }));

    res.json({ success: true, count: employees.length, employees });
  } catch (error: any) {
    console.error('GPS active error:', error.message);
    // Fallback – return empty list
    res.json({ success: true, count: 0, employees: [] });
  }
});

// GET /api/gps/tracking/:userId?start=&end=
router.get('/tracking/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { start, end } = req.query;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);
    if (decoded.id !== userId) {
      const userRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1', [decoded.id]);
      if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
      const requestUser = userRes.rows[0];
      const targetRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
      if (targetRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Target user not found' });
      if (requestUser.company_id !== targetRes.rows[0].company_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (!['boss', 'manager'].includes(requestUser.role)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    let query = 'SELECT * FROM gps_tracking WHERE user_id = $1';
    const params: any[] = [userId];
    if (start) { query += ' AND timestamp >= $2'; params.push(start); }
    if (end)   { query += ' AND timestamp <= $3'; params.push(end); }
    query += ' ORDER BY timestamp ASC';
    const result = await pool.query(query, params);
    res.json({ success: true, tracking: result.rows });
  } catch (error: any) {
    console.error('GPS tracking error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch GPS tracking' });
  }
});

export default router;

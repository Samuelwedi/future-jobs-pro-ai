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
      geofenceStatus: point.geofenceStatus,
      isMoving: point.isMoving,
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
// Optional: ?userId=xxx (for boss/manager)
router.get('/trail/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const timeEntryId = Array.isArray(req.params.timeEntryId)
      ? req.params.timeEntryId[0]
      : req.params.timeEntryId;
    if (!timeEntryId) {
      return res.status(400).json({ success: false, message: 'Missing timeEntryId' });
    }

    // Convert userId to string safely – if it's an array, take the first element
    const userId = req.query.userId ? String(req.query.userId) : undefined;

    // If userId is provided, verify the user belongs to the same company
    if (userId) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer '))
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      const decoded = verifyToken(req);
      const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
      const targetRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
      if (targetRes.rows.length === 0 || targetRes.rows[0].company_id !== userRes.rows[0].company_id) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const trail = await generateBreadcrumbTrail(timeEntryId, userId);
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
    const locations = await getActiveEmployeeLocations(req.params.companyId as string);
    res.json({ success: true, count: locations.length, employees: locations });
  } catch (error: any) {
    console.error('GPS active error:', error.message);
    res.json({ success: true, count: 0, employees: [] });   // safe fallback
  }
});

export default router;
// ============================================
// GPS ROUTES
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import {
  recordGPSPoint,
  generateBreadcrumbTrail,
  getArrivalConfidence,
  getActiveEmployeeLocations
} from '../services/gpsService';

const router = express.Router();

// POST /api/gps/update – Mobile app sends location every 30 seconds
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
  } catch (error) {
    console.error('❌ GPS update error:', error);
    res.status(500).json({ success: false, message: 'Failed to record GPS point' });
  }
});

// GET /api/gps/trail/:timeEntryId – Full breadcrumb trail
router.get('/trail/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const trail = await generateBreadcrumbTrail(req.params.timeEntryId as string);
    res.json({ success: true, trail });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get breadcrumb trail' });
  }
});

// GET /api/gps/confidence/:timeEntryId – Arrival confidence score
router.get('/confidence/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const confidence = await getArrivalConfidence(req.params.timeEntryId as string);
    res.json({ success: true, ...confidence });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to calculate confidence' });
  }
});

// GET /api/gps/active/:companyId – Who's working right now
router.get('/active/:companyId', async (req: Request, res: Response) => {
  try {
    const locations = await getActiveEmployeeLocations(req.params.companyId as string);
    res.json({ success: true, count: locations.length, employees: locations });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get active locations' });
  }
});

export default router;
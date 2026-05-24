// ============================================
// SCHEDULE ROUTES (with shift update notifications)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import express, { Request, Response } from 'express';
import {
  createShift,
  updateShift,
  deleteShift,
  getCompanyShifts,
  getShiftById,
  assignEmployee,
  unassignEmployee,
  getShiftAssignments,
  getUserShifts,
  notifyShiftUpdate,
} from '../services/scheduleService';

const router = express.Router();

// ---- SHIFTS ----

// GET /api/schedule/shifts?companyId=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/shifts', async (req: Request, res: Response) => {
  try {
    const { companyId, start, end } = req.query;
    if (!companyId || !start || !end) {
      return res.status(400).json({ success: false, message: 'companyId, start, and end are required' });
    }
    const shifts = await getCompanyShifts(companyId as string, start as string, end as string);
    res.json({ success: true, shifts });
  } catch (error: any) {
    console.error('Get shifts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/schedule/shifts/:id
router.get('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const shift = await getShiftById(req.params.id as string);
    if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
    const assignments = await getShiftAssignments(req.params.id as string);
    res.json({ success: true, shift, assignments });
  } catch (error: any) {
    console.error('Get shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/schedule/shifts
router.post('/shifts', async (req: Request, res: Response) => {
  try {
    const { companyId, projectId, name, date, startTime, endTime, notes, createdBy, employeeIds } = req.body;
    if (!companyId || !projectId || !name || !date || !startTime || !endTime || !createdBy) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const shift = await createShift(companyId, projectId, name, date, startTime, endTime, createdBy, notes);
    // Assign employees if provided
    if (employeeIds && Array.isArray(employeeIds)) {
      for (const uid of employeeIds) {
        await assignEmployee(shift.id, uid);
      }
    }
    const assignments = await getShiftAssignments(shift.id);
    res.status(201).json({ success: true, shift, assignments });
  } catch (error: any) {
    console.error('Create shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/schedule/shifts/:id
router.put('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const shift = await updateShift(req.params.id as string, updates);
    // Notify assigned employees that the shift changed
    await notifyShiftUpdate(req.params.id as string).catch(err => console.error('Notify error:', err));
    res.json({ success: true, shift });
  } catch (error: any) {
    console.error('Update shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/schedule/shifts/:id
router.delete('/shifts/:id', async (req: Request, res: Response) => {
  try {
    await deleteShift(req.params.id as string);
    res.json({ success: true, message: 'Shift deleted' });
  } catch (error: any) {
    console.error('Delete shift error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ---- ASSIGNMENTS ----

// POST /api/schedule/shifts/:id/assign
router.post('/shifts/:id/assign', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });
    const assignment = await assignEmployee(req.params.id as string, userId);
    res.status(201).json({ success: true, assignment });
  } catch (error: any) {
    console.error('Assign error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/schedule/shifts/:id/assign/:userId
router.delete('/shifts/:id/assign/:userId', async (req: Request, res: Response) => {
  try {
    await unassignEmployee(req.params.id as string, req.params.userId as string);
    res.json({ success: true, message: 'Employee unassigned' });
  } catch (error: any) {
    console.error('Unassign error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/schedule/my-shifts?userId=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/my-shifts', async (req: Request, res: Response) => {
  try {
    const { userId, start, end } = req.query;
    if (!userId || !start || !end) {
      return res.status(400).json({ success: false, message: 'userId, start, and end are required' });
    }
    const shifts = await getUserShifts(userId as string, start as string, end as string);
    res.json({ success: true, shifts });
  } catch (error: any) {
    console.error('My shifts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
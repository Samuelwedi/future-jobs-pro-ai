import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import {
  createPTORequest,
  updatePTOStatus,
  getCompanyPTORequests,
  getUserPTORequests,
  getUserPTOBalance,
} from '../services/ptoService';

const router = express.Router();

// POST /api/pto/request
router.post('/request', async (req: Request, res: Response) => {
  try {
    const { userId, companyId, startDate, endDate, type, reason } = req.body;
    if (!userId || !companyId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const request = await createPTORequest(userId, companyId, startDate, endDate, type || 'vacation', reason);
    res.status(201).json({ success: true, request });
  } catch (error: any) {
    console.error('Create PTO error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/pto/:id/status
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, approvedBy } = req.body;
    if (!status || !approvedBy) {
      return res.status(400).json({ success: false, message: 'status and approvedBy are required' });
    }
    const request = await updatePTOStatus(req.params.id as string, status, approvedBy);
    res.json({ success: true, request });
  } catch (error: any) {
    console.error('Update PTO status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/pto/company/:companyId
router.get('/company/:companyId', async (req: Request, res: Response) => {
  try {
    const requests = await getCompanyPTORequests(req.params.companyId as string);
    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('Get company PTO error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/pto/user/:userId
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const requests = await getUserPTORequests(req.params.userId as string);
    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('Get user PTO error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/pto/balance/:userId
router.get('/balance/:userId', async (req: Request, res: Response) => {
  try {
    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [req.params.userId as string]);
    if (userResult.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const balance = await getUserPTOBalance(req.params.userId as string, userResult.rows[0].company_id);
    res.json({ success: true, balance });
  } catch (error: any) {
    console.error('Get PTO balance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
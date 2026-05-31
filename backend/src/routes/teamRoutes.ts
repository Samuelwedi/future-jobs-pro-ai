import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { inviteEmployee, getCompanyMembers, updateMemberRole, removeMember, setPassword } from '../services/teamService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// GET /api/team – return members of the logged‑in user's company
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const companyId = userResult.rows[0].company_id;
    if (!companyId) {
      return res.json({ success: true, members: [] });
    }

    const result = await pool.query(
      'SELECT id, email, role, full_name, first_name, last_name FROM users WHERE company_id = $1',
      [companyId]
    );
    res.json({ success: true, members: result.rows });
  } catch (error: any) {
    console.error('Team fetch error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load team' });
  }
});

// POST /api/team/invite
router.post('/invite', async (req: Request, res: Response) => {
  try {
    const { companyId, email, firstName, lastName, role, invitedBy } = req.body;
    if (!companyId || !email || !firstName || !lastName || !role || !invitedBy) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const result = await inviteEmployee(companyId, email, firstName, lastName, role, invitedBy);
    res.status(201).json({
      success: true,
      user: result.user,
      tempPassword: result.tempPassword,
      message: `Employee created. Temporary password: ${result.tempPassword}`
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/team/set-password
router.post('/set-password', async (req: Request, res: Response) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ success: false, message: 'userId and newPassword required' });
    await setPassword(userId, newPassword);
    res.json({ success: true, message: 'Password updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/team/members/:companyId (direct access – used by boss/admin)
router.get('/members/:companyId', async (req: Request, res: Response) => {
  try {
    const members = await getCompanyMembers(req.params.companyId as string);
    res.json({ success: true, members });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/team/:userId/role
router.put('/:userId/role', async (req: Request, res: Response) => {
  try {
    const { role, companyId } = req.body;
    const user = await updateMemberRole(req.params.userId as string, role, companyId);
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/team/:userId
router.delete('/:userId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.body;
    await removeMember(req.params.userId as string, companyId);
    res.json({ success: true, message: 'Member removed' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
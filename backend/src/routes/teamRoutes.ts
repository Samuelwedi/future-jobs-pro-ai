import { companyActor,manages } from '../middleware/companyActor';
import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { inviteEmployee, getCompanyMembers, updateMemberRole, removeMember, setPassword } from '../services/teamService';

const router = express.Router();
router.use(companyActor);
router.use((req,res,next)=>{const a=res.locals.actor;if(req.method!=='GET'&&!manages(a))return res.status(403).json({message:'Manager access required'});if(req.body?.companyId&&String(req.body.companyId)!==String(a.company_id))return res.status(403).json({message:'Company access denied'});next();});

// Helper to safely get userId as string
const getUserId = (req: Request): string => {
  return String(req.params.userId);
};

// Helper to safely get companyId as string
const getCompanyId = (req: Request): string => {
  return String(req.params.companyId);
};

// GET /api/team
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, full_name, first_name, last_name FROM users WHERE company_id = $1',
      [res.locals.actor.company_id]
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

    if (String(invitedBy) !== String(res.locals.actor.id)) {
      return res.status(403).json({ success: false, message: 'Inviter must match the authenticated manager' });
    }

    if(!['employee','manager'].includes(role)|| (role==='manager'&&!['boss','admin'].includes(res.locals.actor.role)))return res.status(403).json({message:'This role cannot be assigned by your account'});
    const result = await inviteEmployee(companyId, email, firstName, lastName, role, invitedBy);
    res.status(201).json({
      success: true,
      user: result.user,
      tempPassword: result.tempPassword,
      message: `Employee created. Temporary password: ${result.tempPassword}`
    });
  } catch (error: any) {
    console.error('Invite error:', error);
    if (error.message.includes('already exists')) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists' });
    }
    if (error.message.includes('Inviter not found')) {
      return res.status(400).json({ success: false, message: 'Inviter not found' });
    }
    if (error.message.includes('does not belong to this company')) {
      return res.status(403).json({ success: false, message: 'Inviter does not belong to this company' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/team/set-password
router.post('/set-password', async (req: Request, res: Response) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ success: false, message: 'userId and newPassword required' });

    const targetRole=(await pool.query('SELECT lower(role) role FROM users WHERE id=$1 AND company_id=$2',[userId,res.locals.actor.company_id])).rows[0]?.role;
    if(!targetRole)return res.status(404).json({message:'User not found in your company'});
    if(targetRole==='boss'&&String(userId)!==String(res.locals.actor.id))return res.status(403).json({message:'The owner password cannot be reset here'});
    if(targetRole!=='employee'&&!['boss','admin'].includes(res.locals.actor.role))return res.status(403).json({message:'Only the owner can manage privileged accounts'});
    if(String(newPassword).length<12)return res.status(400).json({message:'Use at least 12 characters'});
    await setPassword(userId, newPassword);
    res.json({ success: true, message: 'Password updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/team/members/:companyId
router.get('/members/:companyId', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if(companyId!==String(res.locals.actor.company_id))return res.status(403).json({message:'Company access denied'});
    const members = await getCompanyMembers(companyId);
    res.json({ success: true, members });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/team/:userId/role
router.put('/:userId/role', async (req: Request, res: Response) => {
  try {
    const { role, companyId } = req.body;
    if(!['boss','admin'].includes(res.locals.actor.role))return res.status(403).json({message:'Only the owner can change roles'});
    const targetRole=(await pool.query('SELECT role FROM users WHERE id=$1 AND company_id=$2',[req.params.userId,res.locals.actor.company_id])).rows[0]?.role;
    if(targetRole==='boss')return res.status(403).json({message:'Use ownership transfer to change the owner'});
    const userId = getUserId(req);
    if(!['employee','manager'].includes(String(role).toLowerCase()))return res.status(400).json({success:false,message:'Role must be employee or manager'});
    const user = await updateMemberRole(userId, role, res.locals.actor.company_id);
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/team/:userId/transfer-ownership
// There must be exactly one company owner. Only the current boss may transfer
// ownership, and only to an active manager in the same company.
router.post('/:userId/transfer-ownership', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const decoded = verifyToken(req);
    const targetId = getUserId(req);
    if (String(req.body.confirmation || '') !== 'TRANSFER OWNERSHIP') {
      return res.status(400).json({ success: false, message: 'Ownership transfer confirmation is required' });
    }
    await client.query('BEGIN');
    const actorResult = await client.query(
      `SELECT id, company_id, role FROM users
       WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
      [decoded.id],
    );
    const actor = actorResult.rows[0];
    if (!actor || String(actor.role).toLowerCase() !== 'boss' || !actor.company_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Only the current Boss can transfer company ownership' });
    }
    if (actor.id === targetId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Select a manager to become the new Boss' });
    }
    const targetResult = await client.query(
      `SELECT id, role, first_name, last_name FROM users
       WHERE id = $1 AND company_id = $2 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
      [targetId, actor.company_id],
    );
    const target = targetResult.rows[0];
    if (!target || String(target.role).toLowerCase() !== 'manager') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'The new Boss must be an active manager in your company' });
    }

    await client.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['manager', actor.id]);
    await client.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['boss', target.id]);
    await client.query(
      `INSERT INTO company_admin_audit_logs(company_id, actor_id, employee_id, action, details)
       VALUES($1,$2,$3,'company.ownership_transferred',$4)`,
      [actor.company_id, actor.id, target.id, JSON.stringify({ previousBossId: actor.id, newBossId: target.id })],
    );
    await client.query('COMMIT');
    res.json({
      success: true,
      message: `${target.first_name || ''} ${target.last_name || ''}`.trim() + ' is now the company Boss',
      currentUserRole: 'manager',
      newBossId: target.id,
    });
  } catch (error: any) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Ownership transfer error:', error.message);
    res.status(500).json({ success: false, message: 'Company ownership could not be transferred' });
  } finally {
    client.release();
  }
});

// DELETE /api/team/:userId
router.delete('/:userId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const target=(await pool.query('SELECT lower(role) role FROM users WHERE id=$1 AND company_id=$2',[userId,res.locals.actor.company_id])).rows[0];
    if(!target)return res.status(404).json({message:'User not found in your company'});
    if(target.role==='boss')return res.status(403).json({message:'Transfer ownership before removing the owner'});
    await removeMember(userId, res.locals.actor.company_id);
    res.json({ success: true, message: 'Member removed' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

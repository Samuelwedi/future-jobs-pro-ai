import taskEvidenceRoutes from './taskEvidenceRoutes';
import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { isManagerRole } from '../middleware/companyActor';
import { createCompanyTask, TaskInputError } from '../services/companyTaskService';

const router = express.Router();
router.use('/:id/evidence', taskEvidenceRoutes);

// GET /api/tasks – return tasks for the logged‑in user's company
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const userRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1 AND COALESCE(is_active,TRUE)=TRUE', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.json({ success: true, tasks: [] });

    const canSeeAll = isManagerRole(userRes.rows[0].role);
    const result = await pool.query(
      `SELECT t.*, u.first_name || ' ' || u.last_name AS assigned_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id AND u.company_id=t.company_id
       WHERE t.company_id = $1 AND ($2::boolean = true OR t.assigned_to = $3)
       ORDER BY t.created_at DESC`,
      [companyId, canSeeAll, decoded.id]
    );
    res.json({ success: true, tasks: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/tasks – create a new task
router.post('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const userRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1 AND COALESCE(is_active,TRUE)=TRUE', [decoded.id]);
    if (userRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId)
      return res.status(400).json({ success: false, message: 'Company not assigned' });
    if (!isManagerRole(userRes.rows[0].role))
      return res.status(403).json({ success: false, message: 'Boss or manager access is required to create tasks' });

    const { description, assigned_to } = req.body;
    const task = await createCompanyTask({id:decoded.id,company_id:companyId,role:String(userRes.rows[0].role).toLowerCase()}, description, assigned_to, true);
    res.status(201).json({ success: true, task });
  } catch (error: any) {
    if (error instanceof TaskInputError) return res.status(error.status).json({success:false,message:error.message});
    console.error('Task creation error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create task' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const decoded=verifyToken(req); const actor=await pool.query('SELECT company_id,role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE',[decoded.id]);
    if(!actor.rowCount||!actor.rows[0].company_id)return res.status(401).json({success:false,message:'Not authenticated'});
    const status=String(req.body.status||''); if(!['pending','in_progress','completed'].includes(status))return res.status(400).json({success:false,message:'Invalid task status'});
    const isManager=isManagerRole(actor.rows[0].role);
    const result=await pool.query(
      `UPDATE tasks SET status=$1
       WHERE id=$2 AND company_id=$3
         AND ($4::boolean = true OR assigned_to=$5)
       RETURNING *`,
      [status,req.params.id,actor.rows[0].company_id,isManager,decoded.id]
    );
    if(!result.rowCount)return res.status(404).json({success:false,message:'Task not found'});
    res.json({success:true,task:result.rows[0]});
  } catch(error:any){res.status(500).json({success:false,message:error.message});}
});

export default router;

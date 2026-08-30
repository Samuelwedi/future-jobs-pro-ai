import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// GET /api/tasks – return tasks for the logged‑in user's company
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    
    const decoded = verifyToken(req);

    const userRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.json({ success: true, tasks: [] });

    const canSeeAll = ['boss', 'manager', 'admin'].includes(String(userRes.rows[0].role || '').toLowerCase());
    const result = await pool.query(
      `SELECT t.*, u.first_name || ' ' || u.last_name AS assigned_name
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
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

    const userRes = await pool.query('SELECT company_id, role FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0)
      return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId)
      return res.status(400).json({ success: false, message: 'Company not assigned' });
    if (!['boss', 'manager', 'admin'].includes(String(userRes.rows[0].role || '').toLowerCase()))
      return res.status(403).json({ success: false, message: 'Boss or manager access is required to create tasks' });

    const { description, assigned_to } = req.body;
    if (!description)
      return res.status(400).json({ success: false, message: 'Task description is required' });

    const result = await pool.query(
      `INSERT INTO tasks (company_id, description, assigned_to, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [companyId, description, assigned_to || null]
    );
    if (assigned_to) {
      await pool.query(
        `INSERT INTO in_app_notifications (company_id,user_id,title,message,notification_type,action_url)
         SELECT $1,id,'New task assigned',$2,'task','/tasks' FROM users WHERE id=$3 AND company_id=$1`,
        [companyId, description, assigned_to],
      );
    }
    res.status(201).json({ success: true, task: result.rows[0] });
  } catch (error: any) {
    console.error('Task creation error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create task' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const decoded=verifyToken(req); const actor=await pool.query('SELECT company_id,role FROM users WHERE id=$1',[decoded.id]);
    if(!actor.rowCount||!actor.rows[0].company_id)return res.status(401).json({success:false,message:'Not authenticated'});
    const status=String(req.body.status||''); if(!['pending','in_progress','completed'].includes(status))return res.status(400).json({success:false,message:'Invalid task status'});
    const isManager=['boss','manager','admin'].includes(String(actor.rows[0].role||'').toLowerCase());
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

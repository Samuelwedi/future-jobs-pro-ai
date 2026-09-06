import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const decoded = verifyToken(req);
    const actorResult = await pool.query(
      'SELECT company_id, role FROM users WHERE id = $1',
      [decoded.id]
    );
    const actor = actorResult.rows[0];
    if (!actor?.company_id) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const canSeeCompany = ['boss', 'manager', 'admin'].includes(String(actor.role || '').toLowerCase());
    const result = await pool.query(
      `SELECT pr.*, u.first_name || ' ' || u.last_name AS user_name
       FROM pto_requests pr
       JOIN users u ON u.id = pr.user_id
       WHERE COALESCE(pr.company_id, u.company_id) = $1
         AND ($2::boolean = true OR pr.user_id = $3)
       ORDER BY pr.start_date DESC, pr.created_at DESC`,
      [actor.company_id, canSeeCompany, decoded.id]
    );
    res.json({ success: true, requests: result.rows });
  } catch (error: any) {
    console.error('PTO history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const decoded=verifyToken(req);
    const actorResult=await pool.query("SELECT company_id,LOWER(COALESCE(role,'employee')) role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE",[decoded.id]);
    const actor=actorResult.rows[0];
    if(!actor || !['boss','manager','admin'].includes(actor.role)) return res.status(403).json({success:false,message:'Manager access is required'});
    const status=String(req.body.status||'').toLowerCase();
    if(!['approved','rejected'].includes(status)) return res.status(400).json({success:false,message:'Status must be approved or rejected'});
    const managerNote=String(req.body.managerNote||'').trim();
    if(status==='rejected' && managerNote.length<3) return res.status(400).json({success:false,message:'Add a reason for rejecting this request'});
    const result=await pool.query(
      `UPDATE pto_requests pr SET status=$1,approved_by=$2,approved_at=NOW(),manager_note=$3,updated_at=NOW()
       FROM users u WHERE pr.id=$4 AND u.id=pr.user_id AND COALESCE(pr.company_id,u.company_id)=$5 RETURNING pr.*`,
      [status,decoded.id,managerNote||null,String(req.params.id),actor.company_id],
    );
    if(!result.rowCount)return res.status(404).json({success:false,message:'PTO request not found'});
    res.json({success:true,request:result.rows[0]});
  } catch(error:any){res.status(500).json({success:false,message:error.message});}
});

export default router;

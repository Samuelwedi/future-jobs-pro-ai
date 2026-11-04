import { recordUserEvent } from '../services/adaptiveAIService';
import { bulkClockIn } from '../services/bulkClockService';
import { completeTimeEntry } from '../services/overtimeService';
import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import { pool } from '../config/database';

const router = express.Router();

// GET /api/crew – list crew members
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    const decoded = verifyToken(req);
    const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const companyId = userRes.rows[0].company_id;
    if (!companyId) return res.json({ success: true, crew: [] });
    const result = await pool.query(
      'SELECT id, first_name, last_name, email FROM users WHERE company_id = $1',
      [companyId]
    );
    res.json({ success: true, crew: result.rows });
  } catch (error: any) {
    console.error('Crew list error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch crew' });
  }
});

// Supervisor actions always resolve the active actor from the database.
router.use(['/clock-in', '/clock-out'], async (req, res, next) => {
  try {
    const decoded = verifyToken(req);
    const actor = await pool.query("SELECT id, company_id, role FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE", [decoded.id]);
    if (!actor.rows[0] || !['boss','manager'].includes(String(actor.rows[0].role).toLowerCase())) return res.status(403).json({success:false,message:'Manager access is required'});
    res.locals.actor = actor.rows[0]; next();
  } catch { res.status(401).json({success:false,message:'Not authenticated'}); }
});

router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const {shiftId,latitude,longitude} = req.body;
    const actor = res.locals.actor;
    if (!shiftId) return res.status(400).json({success:false,message:'shiftId is required'});
    const shift = await pool.query('SELECT id,project_id FROM shifts WHERE id=$1 AND company_id=$2', [shiftId,actor.company_id]);
    if (!shift.rows.length) return res.status(404).json({success:false,message:'Shift not found'});
    const assignments = await pool.query('SELECT user_id FROM shift_assignments WHERE shift_id=$1', [shiftId]);
    const results = await bulkClockIn(actor.id,{userIds:assignments.rows.map(row=>row.user_id),projectId:shift.rows[0].project_id,latitude,longitude});
    const clockedIn = results.filter(result=>result.success).map(result=>({userId:result.userId,timeEntryId:result.timeEntryId}));
    for (const entry of clockedIn) await recordUserEvent({userId:entry.userId,eventType:'clock_in',eventData:{projectId:shift.rows[0].project_id,timeEntryId:entry.timeEntryId,crew:true,shiftId},latitude,longitude}).catch(error=>console.error('Crew event logging failed:',error));
    res.json({success:true,message:`${clockedIn.length} crew members clocked in`,clockedIn,results});
  } catch (error:any) { res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Crew clock-in was not confirmed; refresh status before retrying'}); }
});

router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const {shiftId,userId,timeEntryId,latitude,longitude} = req.body;
    const actor = res.locals.actor;
    let targets: Array<{user_id:string;id:string}>;
    if (shiftId) {
      const shift = await pool.query('SELECT id,project_id FROM shifts WHERE id=$1 AND company_id=$2',[shiftId,actor.company_id]);
      if (!shift.rows.length) return res.status(404).json({success:false,message:'Shift not found'});
      const active = await pool.query(`SELECT DISTINCT te.id,te.user_id FROM time_entries te
        JOIN users u ON u.id=te.user_id JOIN shift_assignments sa ON sa.user_id=te.user_id
        WHERE sa.shift_id=$1 AND u.company_id=$2 AND te.project_id=$3 AND te.clock_out IS NULL`,[shiftId,actor.company_id,shift.rows[0].project_id]);
      targets=active.rows;
    } else {
      if (!userId || !timeEntryId) return res.status(400).json({success:false,message:'userId and timeEntryId are required'});
      targets=[{user_id:userId,id:timeEntryId}];
    }
    const clockedOut=[];
    for (const target of targets) {
      const entry=await completeTimeEntry(actor.company_id,target.user_id,target.id,latitude,longitude,true);
      clockedOut.push({userId:target.user_id,timeEntryId:entry.id});
      await recordUserEvent({userId:target.user_id,eventType:'clock_out',eventData:{projectId:entry.project_id,timeEntryId:entry.id,crew:Boolean(shiftId),shiftId},latitude,longitude}).catch(error=>console.error('Crew event logging failed:',error));
    }
    res.json({success:true,message:`${clockedOut.length} crew members clocked out`,clockedOut,...(!shiftId ? {timeEntryId:clockedOut[0]?.timeEntryId} : {})});
  } catch (error:any) { res.status(error.status || 500).json({success:false,message:error.status ? error.message : 'Crew clock-out was not confirmed; refresh status before retrying'}); }
});

export default router;

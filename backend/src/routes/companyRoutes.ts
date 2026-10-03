import { verifyToken } from '../utils/auth';
import express, { Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../config/database';
import { readOvertimePolicy, validateOvertimePolicy } from '../services/overtimePolicy';
import { lockCompanyTime, refreshCompanyOvertime } from '../services/overtimeService';
import { companyActor, manages } from '../middleware/companyActor';

const router = express.Router();
router.use(companyActor);
router.use('/:companyId', (req, res, next) => {
  if (String(req.params.companyId) !== String(res.locals.actor.company_id)) {
    return res.status(403).json({ success: false, message: 'Company access denied' });
  }
  next();
});
const requireCompanyManager = (_req: Request, res: Response, next: any) => {
  if (!manages(res.locals.actor)) {
    return res.status(403).json({ success: false, message: 'Manager access is required' });
  }
  next();
};

const logoDir = path.join(__dirname, '../../uploads/logos');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' } as Record<string, string>)[file.mimetype] || '';
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPEG, and WebP images are allowed') as any, false);
  }
});

// ─── GET /api/companies/:companyId ───
router.get('/:companyId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, logo_url, temperature_unit, office_city, office_latitude, office_longitude,
              address, phone, email
       FROM companies WHERE id = $1`,
      [req.params.companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, ...result.rows[0] });
  } catch (error: any) {
    console.error('Get company error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/companies/:companyId ─── (update general info)
router.put('/:companyId', requireCompanyManager, async (req: Request, res: Response) => {
  try {
    const { name, address, phone, email } = req.body;
    const result = await pool.query(
      `UPDATE companies SET name = $1, address = $2, phone = $3, email = $4 WHERE id = $5
       RETURNING id, name, address, phone, email, logo_url, temperature_unit`,
      [name, address, phone, email, req.params.companyId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    res.json({ success: true, company: result.rows[0] });
  } catch (error: any) {
    console.error('Update company error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/companies/:companyId/logo
router.post('/:companyId/logo', requireCompanyManager, upload.single('logo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No logo file provided' });
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    await pool.query('UPDATE companies SET logo_url = $1 WHERE id = $2', [logoUrl, req.params.companyId]);
    res.json({ success: true, logoUrl });
  } catch (error: any) {
    console.error('Logo upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/companies/:companyId/temperature-unit
router.put('/:companyId/temperature-unit', requireCompanyManager, async (req: Request, res: Response) => {
  try {
    const { unit } = req.body;
    if (!unit || !['celsius','fahrenheit'].includes(unit)) {
      return res.status(400).json({ success: false, message: 'Unit must be celsius or fahrenheit' });
    }
    await pool.query('UPDATE companies SET temperature_unit = $1 WHERE id = $2', [unit, req.params.companyId]);
    res.json({ success: true, message: `Temperature unit updated to ${unit}` });
  } catch (error: any) {
    console.error('Temperature unit update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/companies/:companyId/unit
router.get('/:companyId/unit', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT temperature_unit FROM companies WHERE id = $1', [req.params.companyId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Company not found' });
    res.json({ success: true, temperature_unit: result.rows[0].temperature_unit || 'celsius' });
  } catch (error: any) {
    console.error('Get unit error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Company overtime policies are tenant scoped and may be edited only by managers.
router.get('/:companyId/settings', async (req: Request, res: Response) => {
  try {
    const result=await pool.query('SELECT to_jsonb(c) AS settings FROM companies c WHERE id=$1',[req.params.companyId]);
    if(!result.rows.length)return res.status(404).json({success:false,message:'Company not found'});
    const company=result.rows[0].settings;
    res.json({success:true,settings:{...readOvertimePolicy(company),default_hourly_rate:Number(company.default_hourly_rate??20)}});
  }catch(error:any){res.status(400).json({success:false,message:error.message});}
});
router.put('/:companyId/settings', requireCompanyManager, async (req: Request, res: Response) => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const companyId=String(req.params.companyId);
    await lockCompanyTime(client,companyId);
    const current=await client.query('SELECT to_jsonb(c) AS settings FROM companies c WHERE id=$1 FOR UPDATE',[companyId]);
    if(!current.rows.length)throw new Error('Company not found');
    const before=readOvertimePolicy(current.rows[0].settings);
    const next={...before};
    for(const key of Object.keys(before))if(Object.prototype.hasOwnProperty.call(req.body,key))(next as any)[key]=req.body[key];
    validateOvertimePolicy(next);
    const rate=req.body.default_hourly_rate??Number(current.rows[0].settings.default_hourly_rate??20);
    if(typeof rate!=='number'||!Number.isFinite(rate)||rate<0||rate>1000000)throw new Error('Default hourly rate must be a number between 0 and 1000000');
    await client.query(`UPDATE companies SET overtime_enabled=$1,overtime_mode=$2,overtime_threshold_hours=$3,
      overtime_daily_threshold_hours=$4,overtime_multiplier=$5,overtime_week_start=$6,timezone=$7,default_hourly_rate=$8 WHERE id=$9`,
      [next.overtime_enabled,next.overtime_mode,next.overtime_threshold_hours,next.overtime_daily_threshold_hours,next.overtime_multiplier,next.overtime_week_start,next.timezone,rate,companyId]);
    if(JSON.stringify(before)!==JSON.stringify(next))await client.query(`INSERT INTO company_overtime_policy_audit(company_id,actor_id,before_policy,after_policy) VALUES($1,$2,$3,$4)`,[companyId,res.locals.actor.id,JSON.stringify(before),JSON.stringify(next)]);
    if(JSON.stringify(before)!==JSON.stringify(next))await refreshCompanyOvertime(client,companyId);
    await client.query('COMMIT');
    res.json({success:true,settings:{...next,default_hourly_rate:rate}});
  }catch(error:any){await client.query('ROLLBACK');res.status(400).json({success:false,message:error.message});}
  finally{client.release();}
});

export default router;

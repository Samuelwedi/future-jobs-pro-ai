import { Router } from 'express';
import { companyActor } from '../middleware/companyActor';
import { listLucyActivity, LucyActivityError } from '../services/lucyActivityService';
const router = Router();
router.use(companyActor);
router.get('/',async(req,res)=>{
 if(Object.keys(req.query).length)return res.status(400).json({message:'Activity is limited to your current account; filters are not accepted'});
 try { return res.json(await listLucyActivity(res.locals.actor)); }
 catch(error) { return res.status(error instanceof LucyActivityError ? error.status : 503).json({message:error instanceof LucyActivityError ? error.message : 'Activity history is temporarily unavailable'}); }
});
export default router;

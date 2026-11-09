import { Router, Request, Response } from 'express';
import { lucyBackgroundCapability } from '../services/lucyBackgroundProvider';
import { companyActor } from '../middleware/companyActor';
import { createLucyWork, getLucyWork, listLucyWork, lucyWorkEnabled, lucyWorkModes, parseLucyWorkRequest, LucyWorkError } from '../services/lucyWorkService';
const router = Router();
router.use(companyActor);
const handle = (fn: (req: Request,res: Response)=>Promise<unknown>) => async (req:Request,res:Response) => {
 try { await fn(req,res); } catch(error) {
  res.status(error instanceof LucyWorkError ? error.status : 503).json({message:error instanceof LucyWorkError ? error.message : 'Background work is temporarily unavailable'});
 }
};
router.get('/',handle(async (_req,res)=>res.json({enabled:lucyWorkEnabled(),modes:lucyWorkModes(),backgroundInference:lucyBackgroundCapability(),jobs:await listLucyWork(res.locals.actor)})));
router.post('/',handle(async (req,res)=>{const input=parseLucyWorkRequest(req.body);const result=await createLucyWork(res.locals.actor,input.prompt,input.requestKey,input.mode,input.options);return res.status(result.replayed?200:202).json(result);}));
router.get('/:id',handle(async (req,res)=>res.json({job:await getLucyWork(res.locals.actor,String(req.params.id))})));
router.post('/:id/cancel',handle(async (req,res)=>res.json({job:await getLucyWork(res.locals.actor,String(req.params.id),true)})));
export default router;

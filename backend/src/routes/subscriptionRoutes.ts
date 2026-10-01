import { complimentarySubscription } from '../services/complimentaryAccess';
import { canManageCompanyBilling, isBillingOwner, setBillingPermission } from '../services/billingPermission';
import { pool } from '../config/database';
import express, { Request, Response } from 'express';
import { verifyToken } from '../utils/auth';
import { getSubscriptionStatus } from '../services/stripeService';
import { appleBillingReady, processAppleNotification, verifyApplePurchase } from '../services/appleSubscriptionService';
import { loadSubscriptionActor, hasCompanyEntitlement } from '../middleware/trialMiddleware';
import { BillingError, googleAccountId, googleBilling, googleBillingReady, verifyGooglePush } from '../services/googleSubscriptionService';

const router = express.Router();
async function actor(req: Request) {
  const decoded = verifyToken(req);
  return loadSubscriptionActor(decoded.id, decoded.companyId);
}
router.get('/capabilities', async (req, res) => {
  try {
    const a = await actor(req);
    res.set('Cache-Control','no-store');
    res.json({ success:true, google:googleBillingReady(),
      apple:appleBillingReady(),
      canPurchase:!a.complimentary && await canManageCompanyBilling(a.id,a.companyId),
      canManageBilling:await canManageCompanyBilling(a.id,a.companyId),
      canDelegateBilling:isBillingOwner(a.role),
      entitled:hasCompanyEntitlement(a), complimentary:Boolean(a.complimentary),
      googleAccountId:googleAccountId(a.companyId,a.id) });
  } catch { res.status(401).json({success:false,message:'Sign in to load billing options'}); }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const decoded = await actor(req);
    if (!await canManageCompanyBilling(decoded.id,decoded.companyId)) throw new BillingError('Only the boss or an explicitly authorized manager can change billing',403);
    if (decoded.complimentary) throw new BillingError('This company has complimentary access; no purchase is required',409);
    const platform = String(req.body?.platform || '').toLowerCase();
    if (!['ios','apple','android','google'].includes(platform)) throw new BillingError('Unsupported store platform');
    const productId = String(req.body?.productId || '');
    const signedTransaction = String(req.body?.purchaseToken || '');
    if (!productId || !signedTransaction) {
      return res.status(400).json({ success: false, message: 'Product and purchase proof are required.' });
    }
    const subscription = ['android','google'].includes(platform) ? await googleBilling.verify({
      companyId:decoded.companyId,userId:decoded.id,productId,purchaseToken:signedTransaction,
    }) : await verifyApplePurchase({
      companyId: decoded.companyId,
      userId: decoded.id,
      productId,
      signedTransaction,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, subscription });
  } catch (error: any) {
    const message = String(error?.message || 'Apple purchase verification failed');
    const status = error instanceof BillingError ? error.status : /token|authenticated/i.test(message) ? 401 : /not configured|certificates/i.test(message) ? 503 : /another workspace/i.test(message) ? 409 : 400;
    res.status(status).json({ success: false, message });
  }
});

router.post('/google/notifications', async (req,res) => {
  try {
    await verifyGooglePush(req.headers.authorization);
    res.json(await googleBilling.notification(req.body));
  } catch (error) {
    const status = error instanceof BillingError ? error.status : 503;
    res.status(status).json({success:false,message:'Notification could not be processed'});
  }
});

router.post('/apple/notifications', async (req: Request, res: Response) => {
  try {
    const signedPayload = String(req.body?.signedPayload || '');
    if (!signedPayload) return res.status(400).json({ success: false, message: 'signedPayload is required' });
    res.json(await processAppleNotification(signedPayload));
  } catch (error: any) {
    console.error('Apple subscription notification verification failed:', error?.message || error);
    res.status(400).json({ success: false });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const decoded = await actor(req);
    if (decoded.complimentary) {
      res.set('Cache-Control', 'no-store');
      return res.json({success:true,subscription:complimentarySubscription()});
    }
    if (decoded.subscriptionProvider === 'google') await googleBilling.refresh(decoded.companyId);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, subscription: await getSubscriptionStatus(decoded.companyId) });
  } catch (error: any) {
    res.status(error instanceof BillingError ? error.status : 401).json({ success: false, message: error.message });
  }
});

router.get('/billing-managers',async(req,res)=>{
  try {
    const a=await actor(req); if(!isBillingOwner(a.role)) return res.status(403).json({message:'Only the boss can manage billing permissions'});
    const rows=(await pool.query("SELECT id,first_name,last_name,email FROM users WHERE company_id=$1 AND LOWER(role)='manager' AND COALESCE(is_active,TRUE)=TRUE ORDER BY first_name,id",[a.companyId])).rows;
    const managers=await Promise.all(rows.map(async r=>({...r,canManageBilling:await canManageCompanyBilling(r.id,a.companyId)})));
    res.set('Cache-Control','no-store').json({success:true,managers});
  }catch{res.status(401).json({message:'Unable to load billing permissions'});}
});
router.put('/billing-managers/:id',async(req,res)=>{
  try {
    const a=await actor(req);
    if(!isBillingOwner(a.role))return res.status(403).json({message:'Only the boss can manage billing permissions'});
    if(typeof req.body.enabled!=='boolean')return res.status(400).json({message:'enabled must be a boolean'});
    await setBillingPermission(a.id,a.companyId,String(req.params.id),req.body.enabled);
    res.set('Cache-Control','no-store').json({success:true});
  }catch{res.status(403).json({message:'Billing permission was not changed; verify the manager belongs to your company'});}
});
export default router;

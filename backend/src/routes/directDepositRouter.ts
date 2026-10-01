import express from 'express';
import { companyActor, manages } from '../middleware/companyActor';

/**
 * Compatibility tombstone for the pre-RC3 direct-deposit API.
 *
 * The former endpoints accepted and returned raw bank-account values and
 * produced an unverified NACHA-like text file. Keeping those handlers live
 * would allow older clients to bypass the secure payout workflow, so every
 * legacy operation now fails closed. New clients use /api/payouts.
 */
const router = express.Router();

router.use(companyActor);
router.use((_req, res, next) => {
  if (!manages(res.locals.actor)) {
    return res.status(403).json({
      success: false,
      message: 'Payroll administrator access is required',
    });
  }
  next();
});

router.use((_req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(410).json({
    success: false,
    code: 'LEGACY_DIRECT_DEPOSIT_RETIRED',
    message:
      'The legacy direct-deposit and bank-file endpoints were retired for security. Use /api/payouts.',
  });
});

export default router;

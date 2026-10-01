import express, { NextFunction, Request, Response } from 'express';
import { companyActor, manages } from '../middleware/companyActor';
import {
  PayoutActor,
  PayoutError,
  PayoutOrchestrator,
  createPayoutOrchestrator,
} from '../services/nativePayoutService';
import { PostgresPayoutRepository } from '../services/postgresPayoutRepository';

// Direct deposit is disabled: companies make and confirm bank payments themselves.

const defaultOrchestrator = createPayoutOrchestrator({
  repository: new PostgresPayoutRepository(),
  enrollmentReturnUrl: process.env.PAYOUT_ENROLLMENT_RETURN_URL,
});

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

function route(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function actorFrom(res: Response): PayoutActor {
  const actor = res.locals.actor;
  return {
    id: String(actor.id),
    companyId: String(actor.company_id),
    role: String(actor.role || '').toLowerCase(),
  };
}

function onlyKeys(body: unknown, allowed: ReadonlyArray<string>): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PayoutError('A JSON request body is required.', 400, 'INVALID_REQUEST_BODY');
  }
  const input = body as Record<string, unknown>;
  const unexpected = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    throw new PayoutError(`Unexpected request field: ${unexpected[0]}`, 400, 'UNEXPECTED_REQUEST_FIELD');
  }
  return input;
}

function idempotencyKey(req: Request, body: Record<string, unknown>): unknown {
  const header = req.get('Idempotency-Key')?.trim();
  const value = body.idempotencyKey;
  if (header && value && header !== String(value)) {
    throw new PayoutError(
      'The Idempotency-Key header and request body do not match.',
      400,
      'IDEMPOTENCY_KEY_MISMATCH',
    );
  }
  return header || value;
}

export function createPayoutRouter(orchestrator: PayoutOrchestrator = defaultOrchestrator) {
  const router = express.Router();
router.use((req,res,next)=>{if(req.method!=='GET')return res.status(409).json({success:false,message:'Direct deposit is disabled. Use Payroll & Manual Payments.'});next();});

  router.use(companyActor);
  router.use((req, res, next) => {
    if (!manages(res.locals.actor)) {
      return res.status(403).json({
        success: false,
        code: 'PAYOUT_ACCESS_DENIED',
        message: 'Payroll manager access is required',
      });
    }
    next();
  });

  router.get('/capabilities', route(async (_req, res) => {
    const result = await orchestrator.getCapabilities(actorFrom(res));
    res.json({ success: true, ...result });
  }));

  router.get('/settings', route(async (_req, res) => {
    const result = await orchestrator.getSettings(actorFrom(res));
    res.json({ success: true, ...result });
  }));

  router.put('/settings', route(async (req, res) => {
    const body = onlyKeys(req.body, ['country', 'currency', 'adapterId']);
    const settings = await orchestrator.updateSettings({
      actor: actorFrom(res),
      country: body.country,
      currency: body.currency,
      adapterId: body.adapterId,
    });
    res.json({ success: true, settings });
  }));

  router.get('/accounts', route(async (_req, res) => {
    const accounts = await orchestrator.listAccounts(actorFrom(res));
    res.json({ success: true, accounts });
  }));

  router.post('/accounts/enrollment-session', route(async (req, res) => {
    const body = onlyKeys(req.body, ['employeeId']);
    const session = await orchestrator.createEnrollmentSession({
      actor: actorFrom(res),
      employeeId: body.employeeId,
    });
    res.status(201).json({ success: true, session });
  }));

  router.get('/payrolls', route(async (_req, res) => {
    const payrolls = await orchestrator.listPayrolls(actorFrom(res));
    res.json({ success: true, payrolls });
  }));

  router.post('/batches/preview', route(async (req, res) => {
    const body = onlyKeys(req.body, ['payrollId', 'country', 'currency']);
    const preview = await orchestrator.previewBatch({
      actor: actorFrom(res),
      payrollId: body.payrollId,
      country: body.country,
      currency: body.currency,
    });
    res.json({ success: true, preview });
  }));

  router.get('/batches', route(async (req, res) => {
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new PayoutError('Limit must be an integer from 1 to 200.', 400, 'INVALID_LIMIT');
    }
    const batches = await orchestrator.listBatches(actorFrom(res), limit);
    res.json({ success: true, batches });
  }));

  router.post('/batches', route(async (req, res) => {
    const body = onlyKeys(req.body, ['payrollId', 'country', 'currency', 'idempotencyKey']);
    const result = await orchestrator.createBatch({
      actor: actorFrom(res),
      payrollId: body.payrollId,
      country: body.country,
      currency: body.currency,
      idempotencyKey: idempotencyKey(req, body),
    });
    res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
  }));

  router.get('/batches/:id/events', route(async (req, res) => {
    const result = await orchestrator.getBatch({ actor: actorFrom(res), batchId: req.params.id });
    res.json({ success: true, events: result.events });
  }));

  router.get('/batches/:id', route(async (req, res) => {
    const result = await orchestrator.getBatch({ actor: actorFrom(res), batchId: req.params.id });
    res.json({ success: true, ...result });
  }));

  router.post('/batches/:id/approve', route(async (req, res) => {
    const body = onlyKeys(req.body, ['idempotencyKey']);
    const result = await orchestrator.approveBatch({
      actor: actorFrom(res),
      batchId: req.params.id,
      idempotencyKey: idempotencyKey(req, body),
    });
    res.json({ success: true, ...result });
  }));

  router.post('/batches/:id/execute', route(async (req, res) => {
    const body = onlyKeys(req.body, ['confirmation', 'idempotencyKey']);
    const result = await orchestrator.executeBatch({
      actor: actorFrom(res),
      batchId: req.params.id,
      confirmation: body.confirmation,
      idempotencyKey: idempotencyKey(req, body),
    });
    res.json({ success: true, ...result });
  }));

  router.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof PayoutError) {
      return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    }
    if (error?.code === '23505') {
      return res.status(409).json({
        success: false,
        code: 'PAYOUT_DUPLICATE',
        message: 'A payout batch already exists for this payroll or request.',
      });
    }
    if (error?.code === '42P01' || error?.code === '42703') {
      console.error('Payout schema is unavailable', { code: error.code });
      return res.status(503).json({
        success: false,
        code: 'PAYOUT_SCHEMA_NOT_READY',
        message: 'Payout service is not available until its reviewed database migration is applied.',
      });
    }
    console.error('Payout request failed', { code: error?.code, message: error?.message });
    return res.status(503).json({
      success: false,
      code: 'PAYOUT_SERVICE_UNAVAILABLE',
      message: 'Payout service is temporarily unavailable.',
    });
  });

  return router;
}

export default createPayoutRouter();

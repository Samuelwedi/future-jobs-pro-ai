import { Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';

const envInt = (name: string, fallback: number) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const apiTrafficLimit = rateLimit({
  windowMs: envInt('API_RATE_WINDOW_MS', 60_000),
  limit: envInt('API_RATE_LIMIT', 600),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/health' || req.path === '/api/health',
  handler: (_req: Request, res: Response) => res.status(429).json({ success: false, message: 'Too many requests. Please retry shortly.' }),
});

export const lucyTrafficLimit = rateLimit({
  windowMs: envInt('LUCY_RATE_WINDOW_MS', 60_000),
  limit: envInt('LUCY_RATE_LIMIT', 20),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.headers.authorization || req.ip || 'anonymous',
  handler: (_req: Request, res: Response) => res.status(429).json({ success: false, message: 'Lucy is busy. Please retry shortly.' }),
});

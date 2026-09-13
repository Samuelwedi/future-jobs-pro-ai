import { rateLimit } from 'express-rate-limit';

const integer = (name: string, fallback: number) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  passOnStoreError: true,
};

export const apiRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: integer('API_RATE_LIMIT_PER_MINUTE', 600),
  skip: req => req.path === '/health',
  message: { success: false, message: 'Too many requests. Please retry shortly.' },
});

export const authRateLimit = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: integer('AUTH_RATE_LIMIT_PER_15_MINUTES', 30),
  message: { success: false, message: 'Too many authentication attempts. Please retry later.' },
});

export const lucyRateLimit = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: integer('LUCY_RATE_LIMIT_PER_MINUTE', 20),
  message: { success: false, message: 'Lucy is handling high demand. Please retry shortly.' },
});

import { CorsOptions } from 'cors';

const defaultOrigins = [
  'https://www.futurejobsproai.com',
  'https://futurejobsproai.com',
  'https://future-jobs-pro-ai.vercel.app',
  'https://future-jobs-pro-ai-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:19006',
];

function normalizeOrigin(value: string): string {
  let origin = value.trim();

  // Repair accidental Markdown URL formatting: [url](url)
  const markdownMatch = origin.match(/^\[(https?:\/\/[^\]]+)\]\([^)]+\)$/);
  if (markdownMatch) {
    origin = markdownMatch[1];
  }

  return origin.replace(/\/+$/, '');
}

const environmentOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : [];

export const configuredOrigins = Array.from(
  new Set([...defaultOrigins, ...environmentOrigins].map(normalizeOrigin)),
).filter(Boolean);

function isAllowedVercelPreview(origin: string): boolean {
  try {
    const url = new URL(origin);

    return (
      url.protocol === 'https:' &&
      (
        url.hostname === 'future-jobs-pro-ai.vercel.app' ||
        url.hostname.endsWith('-future-jobs-pro-ai.vercel.app')
      )
    );
  } catch {
    return false;
  }
}
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Requests from curl, mobile applications and server-to-server calls
    // may not contain an Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedRequestOrigin = normalizeOrigin(origin);

    if (
      configuredOrigins.includes(normalizedRequestOrigin) ||
      isAllowedVercelPreview(normalizedRequestOrigin)
    ) {
      callback(null, true);
      return;
    }

    console.warn(`Blocked CORS origin: ${normalizedRequestOrigin}`);
    callback(null, false);
  },

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
  ],

  exposedHeaders: ['Content-Disposition'],

  credentials: true,
  optionsSuccessStatus: 204,
};

console.log('Allowed CORS origins:', configuredOrigins);

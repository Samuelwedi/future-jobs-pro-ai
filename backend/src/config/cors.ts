import { CorsOptions } from 'cors';

export const configuredOrigins = (
  process.env.CORS_ORIGINS ||
  [
    'https://www.futurejobsproai.com',
    'https://futurejobsproai.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ].join(',')
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (configuredOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`Blocked CORS origin: ${origin}`);

    return callback(
      new Error(`Origin ${origin} is not permitted by CORS`),
    );
  },

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
  ],

  exposedHeaders: [
    'Content-Disposition',
  ],

  credentials: true,
  optionsSuccessStatus: 204,
};

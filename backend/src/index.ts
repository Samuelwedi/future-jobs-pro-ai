// ============================================
// FUTURE JOBS PRO AI – MAIN SERVER
// Created by: Samuel B.
// ============================================

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import { pool, checkDatabaseHealth } from './config/database';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

// ----- Middleware -----
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:19006', 'http://localhost:5173'],
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ----- Health Check -----
app.get('/api/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  res.json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    owner: 'Samuel B.',
    app: 'Future Jobs Pro AI',
    version: '1.0.0'
  });
});

// ----- Database Test -----
app.get('/api/db-test', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      success: true,
      message: 'Database connected successfully',
      timestamp: result.rows[0].now,
      owner: 'Samuel B.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// ----- Welcome Page -----
app.get('/', (req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Future Jobs Pro AI – Samuel B.</title>
      <style>
        body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; background: #0A0A0A; color: #FFF; }
        h1 { color: #00D4FF; }
        .owner { color: #888; }
        .status { color: #4CAF50; }
        code { background: #1A1A1A; padding: 2px 6px; border-radius: 4px; color: #00D4FF; }
      </style>
    </head>
    <body>
      <h1>🚀 Future Jobs Pro AI</h1>
      <p class="owner">Created by Samuel B.</p>
      <p class="status">✅ Server is running!</p>
      <h2>Available Endpoints:</h2>
      <ul>
        <li><code>GET /api/health</code> – Check server health</li>
        <li><code>GET /api/db-test</code> – Test database connection</li>
        <li><code>POST /api/auth/register</code> – Register a new company</li>
        <li><code>POST /api/auth/login</code> – User login</li>
        <li><code>POST /api/photos/upload</code> – Upload job photos</li>
        <li><code>POST /api/gps/update</code> – Update location</li>
        <li><code>POST /api/voice/process</code> – Process voice notes</li>
        <li><code>GET /api/ai/pattern/:userId</code> – Get AI learned patterns</li>
      </ul>
    </body>
    </html>
  `);
});

// ===== ROUTES =====
import authRoutes from './routes/authRoutes';
app.use('/api/auth', authRoutes);
console.log('🔐 Auth routes registered at /api/auth – Samuel B.');

import aiRoutes from './routes/aiRoutes';
app.use('/api/ai', aiRoutes);
console.log('🧠 AI routes registered at /api/ai – Samuel B.');

import photoRoutes from './routes/photoRoutes';
app.use('/api/photos', photoRoutes);
console.log('📸 Photo routes registered at /api/photos – Samuel B.');

import gpsRoutes from './routes/gpsRoutes';
app.use('/api/gps', gpsRoutes);
console.log('🗺️  GPS routes registered at /api/gps – Samuel B.');

import voiceRoutes from './routes/voiceRoutes';
app.use('/api/voice', voiceRoutes);
console.log('🎙️  Voice routes registered at /api/voice – Samuel B.');

import disputeRoutes from './routes/disputeRoutes';
app.use('/api/dispute', disputeRoutes);
console.log('🛡️  Dispute routes registered at /api/dispute – Samuel B.');

import notificationRoutes from './routes/notificationRoutes';
app.use('/api/notifications', notificationRoutes);
console.log('🔔 Notification routes registered at /api/notifications – Samuel B.');

import stripeRoutes from './routes/stripeRoutes';
app.use('/api/stripe', stripeRoutes);
console.log('💳 Stripe routes registered at /api/stripe – Samuel B.');

import integrationRoutes from './routes/integrationRoutes';
app.use('/api/integrations', integrationRoutes);
console.log('🔗 Integration routes registered at /api/integrations – Samuel B.');

import adminRoutes from './routes/adminRoutes';
app.use('/api/admin', adminRoutes);
console.log('👑 Admin routes registered at /api/admin – Samuel B.');

import projectRoutes from './routes/projectRoutes';
app.use('/api/projects', projectRoutes);
console.log('📋 Project routes registered at /api/projects – Samuel B.');

import timeEntryRoutes from './routes/timeEntryRoutes';
app.use('/api/time-entries', timeEntryRoutes);
console.log('⏰ Time entry routes registered at /api/time-entries – Samuel B.');

// ----- 404 Handler -----
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ----- Global Error Handler -----
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ----- Start Server -----
const port = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
app.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                                                          ║');
  console.log('║   🚀 Future Jobs Pro AI Server Running                  ║');
  console.log('║   Created by: Samuel B.                                 ║');
  console.log('║                                                          ║');
  console.log(`║   📍 Local:            http://localhost:${PORT}           ║`);
  console.log(`║   📊 Environment:      ${process.env.NODE_ENV || 'development'}                       ║`);
  console.log('║   🗄️  Database:         PostgreSQL                      ║');
  console.log('║                                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
});

export default app;
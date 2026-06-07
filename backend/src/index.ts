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
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { pool, checkDatabaseHealth } from './config/database';
import { saveMessage } from './services/chatService';
import { trialCheck } from './middleware/trialMiddleware';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

// ----- CORS (must be before other middleware) -----
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:19006',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://future-jobs-pro-ai.vercel.app',
    'https://balancing-treble-prevent.ngrok-free.dev',
    'https://future-jobs-pro-ai-production.up.railway.app',
    'https://futurejobsproai.com',
    'https://www.futurejobsproai.com',
  ],
  credentials: true,
}));

// ----- Other middleware -----
app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ----- Trial enforcement (must be before routes) -----
app.use(trialCheck);

// ----- Health Check -----
app.get('/api/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  res.json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    owner: 'Samuel B.',
    app: 'Future Jobs Pro AI',
    version: '1.0.0',
  });
});

// ----- Database Test (returns actual error) -----
app.get('/api/db-test', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, timestamp: result.rows[0].now });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => res.send('<h1>🚀 Future Jobs Pro AI</h1>'));

// ===== REST ROUTES =====
import authRoutes from './routes/authRoutes'; app.use('/api/auth', authRoutes);
import aiRoutes from './routes/aiRoutes'; app.use('/api/ai', aiRoutes);
import photoRoutes from './routes/photoRoutes'; app.use('/api/photos', photoRoutes);
import gpsRoutes from './routes/gpsRoutes'; app.use('/api/gps', gpsRoutes);
import voiceRoutes from './routes/voiceRoutes'; app.use('/api/voice', voiceRoutes);
import disputeRoutes from './routes/disputeRoutes'; app.use('/api/dispute', disputeRoutes);
import notificationRoutes from './routes/notificationRoutes'; app.use('/api/notifications', notificationRoutes);
import stripeRoutes from './routes/stripeRoutes'; app.use('/api/stripe', stripeRoutes);
import adminRoutes from './routes/adminRoutes'; app.use('/api/admin', adminRoutes);
import timeEntryRoutes from './routes/timeEntryRoutes'; app.use('/api/time-entries', timeEntryRoutes);
import projectRoutes from './routes/projectRoutes'; app.use('/api/projects', projectRoutes);
import integrationRoutes from './routes/integrationRoutes'; app.use('/api/integrations', integrationRoutes);
import companyRoutes from './routes/companyRoutes'; app.use('/api/companies', companyRoutes);
import chatRoutes from './routes/chatRoutes'; app.use('/api/chat', chatRoutes);
import userRoutes from './routes/userRoutes'; app.use('/api/users', userRoutes);
import scheduleRoutes from './routes/scheduleRoutes'; app.use('/api/schedule', scheduleRoutes);
import crewRoutes from './routes/crewRoutes'; app.use('/api/crew', crewRoutes);
import assistantRoutes from './routes/assistantRoutes'; app.use('/api/assistant', assistantRoutes);
import taskRoutes from './routes/taskRoutes'; app.use('/api/tasks', taskRoutes);
import webhookRoutes from './routes/webhookRoutes'; app.use('/api/webhooks', webhookRoutes);
import ptoRoutes from './routes/ptoRoutes'; app.use('/api/pto', ptoRoutes);
import kioskRoutes from './routes/kioskRoutes'; app.use('/api/kiosk', kioskRoutes);
import formRoutes from './routes/formRoutes'; app.use('/api/forms', formRoutes);
import attachmentRoutes from './routes/attachmentRoutes'; app.use('/api/attachments', attachmentRoutes);
import teamRoutes from './routes/teamRoutes'; app.use('/api/team', teamRoutes);
import paymentRoutes from './routes/paymentRoutes'; app.use('/api/stripe', paymentRoutes);

// ----- Lucy Command Engine (in‑process) -----
app.post('/api/lucy', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const msg = (message as string).toLowerCase().trim();

    // ---- Greetings ----
    if (msg.includes('hello') || msg.includes('hey') || msg.includes('hi')) {
      return res.json([{ text: "Hello! I'm Lucy. How can I help you today?" }]);
    }

    // ---- Team Status ----
    if (msg.includes('team') && (msg.includes('status') || msg.includes('who') || msg.includes('active'))) {
      try {
        const teamRes = await fetch(`http://localhost:${PORT}/api/team`, {
          headers: { Authorization: req.headers.authorization || '' },
        });
        const teamData: any = await teamRes.json();   // <-- type fix
        const count = (teamData.members || []).length;
        return res.json([{ text: `Currently ${count} team member(s) are active.` }]);
      } catch {
        return res.json([{ text: "I couldn't fetch the team status right now." }]);
      }
    }

    // ---- Run Payroll ----
    if (msg.includes('payroll') && (msg.includes('run') || msg.includes('process'))) {
      return res.json([{ text: "Payroll has been processed for the requested period." }]);
    }

    // ---- Create Schedule ----
    if (msg.includes('schedule') && msg.includes('create')) {
      return res.json([{ text: "Schedule created. Please check the calendar for details." }]);
    }

    // ---- Generate Report ----
    if (msg.includes('report') && (msg.includes('generate') || msg.includes('create'))) {
      return res.json([{ text: "Report has been generated. You can view it in the Reports section." }]);
    }

    // ---- Clock In / Out ----
    if (msg.includes('clock') && msg.includes('in')) {
      return res.json([{ text: "You've been clocked in. Have a great shift!" }]);
    }
    if (msg.includes('clock') && msg.includes('out')) {
      return res.json([{ text: "You've been clocked out. Enjoy your evening!" }]);
    }

    // ---- Goodbye ----
    if (msg.includes('bye') || msg.includes('goodbye')) {
      return res.json([{ text: "Goodbye! Have a productive day." }]);
    }

    // ---- Fallback ----
    return res.json([{ text: "I'm not sure how to respond to that yet. You can ask about team status, payroll, scheduling, or reports." }]);

  } catch (error: any) {
    console.error('Lucy engine error:', error.message);
    res.status(500).json({ success: false, message: 'Lucy is taking a break.' });
  }
});

// 404 & error handler
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ----- WebSocket Server -----
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('🔌 New WebSocket connection:', socket.id);

  socket.on('join-room', (roomId: string) => {
    socket.join(`room-${roomId}`);
    console.log(`Socket ${socket.id} joined room-${roomId}`);
  });

  socket.on('leave-room', (roomId: string) => {
    socket.leave(`room-${roomId}`);
    console.log(`Socket ${socket.id} left room-${roomId}`);
  });

  socket.on('chat-message', async (data: { senderId: string; companyId: string; roomId: string; message: string }) => {
    try {
      const saved = await saveMessage(data.senderId, data.roomId, data.message, data.companyId);
      io.to(`room-${data.roomId}`).emit('new-message', saved);
    } catch (err) {
      console.error('Chat message error:', err);
    }
  });
});

// ----- Start Server -----
server.listen(parseInt(PORT as string) || 5000, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   🚀 Future Jobs Pro AI Server Running                  ║');
  console.log('║   Created by: Samuel B.                                 ║');
  console.log('║   WebSocket: enabled                                   ║');
  console.log(`║   📍 Local:            http://localhost:${PORT}           ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
});

export default app;
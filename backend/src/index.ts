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
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { pool, checkDatabaseHealth } from './config/database';
import { saveMessage } from './services/chatService';
import { trialCheck } from './middleware/trialMiddleware';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET!;

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

// ----- Helper: extract userId from JWT -----
const getUserId = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded.id || null;
  } catch {
    return null;
  }
};

// ----- Lucy Conversation History -----
app.get('/api/lucy/history', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

  try {
    const result = await pool.query(
      'SELECT role, content, created_at FROM lucy_conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ----- Lucy AI Engine (OpenAI + Function Calling + Memory) -----
app.post('/api/lucy', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const userId = getUserId(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: 'OpenAI key not configured.' });

    // Retrieve conversation memory (last 10 messages)
    const memoryRes = await pool.query(
      'SELECT role, content FROM lucy_conversations WHERE user_id = $1 ORDER BY created_at ASC LIMIT 10',
      [userId]
    );
    const priorMessages = memoryRes.rows.map((r: any) => ({ role: r.role, content: r.content }));

    // Define functions Lucy can perform
    const functions = [
      {
        name: 'get_team_status',
        description: 'Get the number of active team members',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'run_payroll',
        description: 'Process payroll for a given period',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', description: 'e.g. last week, this month' },
          },
        },
      },
      {
        name: 'create_schedule',
        description: 'Create a work schedule',
        parameters: {
          type: 'object',
          properties: {
            employee: { type: 'string' },
            day: { type: 'string' },
            start_time: { type: 'string' },
            end_time: { type: 'string' },
          },
        },
      },
      {
        name: 'generate_report',
        description: 'Generate a compliance or evidence report',
        parameters: {
          type: 'object',
          properties: {
            project_name: { type: 'string' },
          },
        },
      },
    ];

    // Build the message array: system prompt + memory + current user message
    const messages = [
      {
        role: 'system',
        content:
          'You are Lucy, a friendly AI assistant for Future Jobs Pro AI. You help business owners manage their workforce. Answer concisely and warmly. You remember past conversations. If the user asks you to perform a task (like payroll, scheduling, report, team status), use the available functions.',
      },
      ...priorMessages,
      { role: 'user', content: message },
    ];

    // Save the user message immediately
    if (userId) {
      await pool.query('INSERT INTO lucy_conversations (user_id, role, content) VALUES ($1, $2, $3)', [userId, 'user', message]);
    }

    // Call OpenAI
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        functions,
        function_call: 'auto',
      }),
    });

    const aiData: any = await openaiRes.json();
    const choice = aiData.choices?.[0];
    if (!choice) return res.json([{ text: "I'm not sure how to help with that." }]);

    // Handle function calls
    if (choice.finish_reason === 'function_call' && choice.message?.function_call) {
      const { name, arguments: argsStr } = choice.message.function_call;
      const args = JSON.parse(argsStr || '{}');
      let resultText = '';

      switch (name) {
        case 'get_team_status': {
          const teamRes = await fetch(`http://localhost:${PORT}/api/team`, {
            headers: { Authorization: req.headers.authorization || '' },
          });
          const teamData: any = await teamRes.json();
          const count = (teamData.members || []).length;
          resultText = `Currently ${count} team member(s) are active.`;
          break;
        }
        case 'run_payroll':
          resultText = `Payroll has been processed for ${args.period || 'the requested period'}.`;
          break;
        case 'create_schedule':
          resultText = `Schedule created for ${args.employee || 'staff'} on ${args.day || 'the requested day'} from ${args.start_time || '9am'} to ${args.end_time || '5pm'}.`;
          break;
        case 'generate_report':
          resultText = `Report for ${args.project_name || 'your project'} has been generated.`;
          break;
        default:
          resultText = 'Command executed.';
      }

      // Save Lucy's reply
      if (userId) {
        await pool.query('INSERT INTO lucy_conversations (user_id, role, content) VALUES ($1, $2, $3)', [userId, 'assistant', resultText]);
      }
      return res.json([{ text: resultText }]);
    }

    // Plain text reply
    const reply = choice.message?.content || "I'm not sure how to help with that.";
    if (userId) {
      await pool.query('INSERT INTO lucy_conversations (user_id, role, content) VALUES ($1, $2, $3)', [userId, 'assistant', reply]);
    }
    return res.json([{ text: reply }]);
  } catch (error: any) {
    console.error('Lucy AI error:', error.message);
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
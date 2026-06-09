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

// ----- CORS -----
app.use(cors({
  origin: [
    'http://localhost:3000', 'http://localhost:19006',
    'http://localhost:5173', 'http://localhost:5174',
    'https://future-jobs-pro-ai.vercel.app',
    'https://future-jobs-pro-ai-production.up.railway.app',
    'https://futurejobsproai.com', 'https://www.futurejobsproai.com',
  ],
  credentials: true,
}));

app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ----- Trial middleware -----
app.use(trialCheck);

// ----- Health Check -----
app.get('/api/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  res.json({ status: dbHealthy ? 'healthy' : 'unhealthy', timestamp: new Date().toISOString(), owner: 'Samuel B.', app: 'Future Jobs Pro AI', version: '1.0.0' });
});

app.get('/api/db-test', async (req: Request, res: Response) => {
  try { const result = await pool.query('SELECT NOW()'); res.json({ success: true, timestamp: result.rows[0].now }); }
  catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
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
  try { const token = authHeader.split(' ')[1]; const decoded = jwt.verify(token, JWT_SECRET) as any; return decoded.id || null; }
  catch { return null; }
};

// ----- Lucy Conversation History -----
app.get('/api/lucy/history', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });
  try {
    const result = await pool.query('SELECT role, content, created_at FROM lucy_conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
    res.json({ success: true, messages: result.rows.reverse() });
  } catch (error: any) { res.status(500).json({ success: false, message: error.message }); }
});

// ----- Payroll placeholder endpoint -----
app.post('/api/payroll/run', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { period, companyId } = req.body;
    const result = await pool.query('INSERT INTO payrolls (company_id, period, created_by) VALUES ($1, $2, $3) RETURNING id', [companyId, period, userId]);
    res.json({ success: true, message: `Payroll for ${period} has been processed.`, payrollId: result.rows[0].id });
  } catch (error: any) {
    console.error('Payroll error:', error.message);
    res.status(500).json({ success: false, message: 'Payroll service is temporarily unavailable.' });
  }
});

// ----- Lucy AI Engine (OpenAI + Function Calling + Memory + ALL Operations) -----
app.post('/api/lucy', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const userId = getUserId(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: 'OpenAI key not configured.' });

    // Memory (last 10 messages)
    const memoryRes = await pool.query('SELECT role, content FROM lucy_conversations WHERE user_id = $1 ORDER BY created_at ASC LIMIT 10', [userId]);
    const priorMessages = memoryRes.rows.map((r: any) => ({ role: r.role, content: r.content }));

    // ---- ALL FUNCTIONS LUCY CAN PERFORM ----
    const functions = [
      { name: 'get_team_status', description: 'How many team members are active', parameters: { type: 'object', properties: {} } },
      {
        name: 'run_payroll', description: 'Process payroll for a period',
        parameters: { type: 'object', properties: { period: { type: 'string', description: 'e.g. last week, this month' } } },
      },
      {
        name: 'get_payroll_details', description: 'Show recently processed payroll records',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'create_schedule', description: 'Create a work shift',
        parameters: {
          type: 'object',
          properties: { employee: { type: 'string' }, day: { type: 'string' }, start_time: { type: 'string' }, end_time: { type: 'string' }, notes: { type: 'string' } },
        },
      },
      {
        name: 'list_schedule', description: 'Show upcoming schedules',
        parameters: { type: 'object', properties: { period: { type: 'string', description: 'e.g. this week, next week' } } },
      },
      {
        name: 'generate_report', description: 'Generate a compliance report for a project',
        parameters: { type: 'object', properties: { project_name: { type: 'string' } } },
      },
      { name: 'clock_in', description: 'Clock the user in', parameters: { type: 'object', properties: {} } },
      { name: 'clock_out', description: 'Clock the user out', parameters: { type: 'object', properties: {} } },
      {
        name: 'list_timesheet', description: 'Show my recent time entries',
        parameters: { type: 'object', properties: { days: { type: 'number', description: 'Number of days to look back' } } },
      },
      { name: 'list_projects', description: 'Show active projects', parameters: { type: 'object', properties: {} } },
      {
        name: 'create_project', description: 'Add a new project',
        parameters: { type: 'object', properties: { name: { type: 'string' }, client_name: { type: 'string' } } },
      },
      { name: 'list_tasks', description: 'Show tasks', parameters: { type: 'object', properties: { status: { type: 'string', description: 'pending, in_progress, completed' } } } },
      {
        name: 'create_task', description: 'Add a new task',
        parameters: { type: 'object', properties: { description: { type: 'string' }, assigned_to: { type: 'string', description: 'employee name or id' } } },
      },
      {
        name: 'request_pto', description: 'Submit a PTO request',
        parameters: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' }, type: { type: 'string', description: 'vacation, sick, etc.' } } },
      },
      { name: 'list_pto', description: 'Show PTO requests', parameters: { type: 'object', properties: {} } },
      { name: 'get_crew_location', description: 'Show current crew GPS locations', parameters: { type: 'object', properties: {} } },
      {
        name: 'send_chat', description: 'Send a message in team chat',
        parameters: { type: 'object', properties: { message: { type: 'string' }, room: { type: 'string', description: 'room or recipient' } } },
      },
    ];

    const messages = [
      {
        role: 'system',
        content:
          'You are Lucy, a brilliant AI assistant for Future Jobs Pro AI, a workforce management platform. You have full access to the user\'s operations: schedules, timesheets, projects, tasks, PTO, payroll, team, chat, reports, and crew locations. You can execute any of these tasks through functions. Always confirm after executing. Speak warmly and concisely. If a service is temporarily down, say so politely.',
      },
      ...priorMessages,
      { role: 'user', content: message },
    ];

    // Save user message
    if (userId) await pool.query('INSERT INTO lucy_conversations (user_id, role, content) VALUES ($1,$2,$3)', [userId, 'user', message]);

    // Call OpenAI
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o', messages, functions, function_call: 'auto' }),
    });
    const aiData: any = await openaiRes.json();
    const choice = aiData.choices?.[0];
    if (!choice) return res.json([{ text: "I'm not sure how to help with that." }]);

    // Function call handling
    if (choice.finish_reason === 'function_call' && choice.message?.function_call) {
      const { name, arguments: argsStr } = choice.message.function_call;
      const args = JSON.parse(argsStr || '{}');
      let resultText = '';
      try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
        const decodedToken: any = token ? jwt.verify(token, JWT_SECRET) : {};
        const companyId = decodedToken.companyId || null;

        switch (name) {
          case 'get_team_status': {
            const teamRes = await fetch(`http://localhost:${PORT}/api/team`, { headers: { Authorization: authHeader } });
            if (!teamRes.ok) throw new Error('Team service down');
            const teamData: any = await teamRes.json();
            const count = (teamData.members || []).length;
            resultText = `You have ${count} team member(s) active.`;
            break;
          }
          case 'run_payroll': {
            const period = args.period || 'the requested period';
            const payrollRes = await fetch(`http://localhost:${PORT}/api/payroll/run`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ period, companyId, userId }),
            });
            if (!payrollRes.ok) throw new Error('Payroll service down');
            const payrollData: any = await payrollRes.json();
            resultText = payrollData.message || `Payroll for ${period} processed.`;
            break;
          }
          case 'get_payroll_details': {
            if (!companyId) throw new Error('Company ID missing from token');
            const payrollRows = await pool.query(
              'SELECT period, created_at FROM payrolls WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5',
              [companyId]
            );
            if (payrollRows.rows.length > 0) {
              const details = payrollRows.rows
                .map((p: any) => `Payroll for ${p.period} – processed on ${new Date(p.created_at).toLocaleDateString()}`)
                .join('; ');
              resultText = `Here are the recent payrolls: ${details}`;
            } else {
              resultText = 'No payroll records found.';
            }
            console.log('Payroll details fetched:', payrollRows.rows.length, 'rows');
            break;
          }
          case 'create_schedule': {
            const { employee, day, start_time, end_time, notes } = args;
            const scheduleRes = await fetch(`http://localhost:${PORT}/api/schedule/shifts`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({
                name: `Shift for ${employee || 'staff'}`, date: day, startTime: start_time || '09:00', endTime: end_time || '17:00', notes: notes || '', employeeIds: [],
              }),
            });
            if (!scheduleRes.ok) throw new Error('Schedule service down');
            const schedData: any = await scheduleRes.json();
            resultText = schedData.success
              ? `Schedule created for ${employee || 'employee'} on ${day || 'that day'} from ${start_time || '9am'} to ${end_time || '5pm'}.`
              : 'Could not create schedule.';
            break;
          }
          case 'list_schedule': {
            const period = args.period || 'this week';
            const now = new Date();
            let start = '', end = '';
            if (period.includes('next')) { start = formatDate(addDays(now, 7)); end = formatDate(addDays(now, 13)); }
            else { start = formatDate(now); end = formatDate(addDays(now, 6)); }
            const scheduleRes = await fetch(`http://localhost:${PORT}/api/schedule/shifts?start=${start}&end=${end}`, { headers: { Authorization: authHeader } });
            if (!scheduleRes.ok) throw new Error('Schedule service down');
            const shifts: any = await scheduleRes.json();
            const count = (shifts.shifts || []).length;
            resultText = `You have ${count} upcoming shift(s) for ${period}.`;
            break;
          }
          case 'generate_report': {
            const project = args.project_name || 'Project';
            const reportRes = await fetch(`http://localhost:${PORT}/api/photos/report`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ projectName: project, reportTitle: `Evidence Report - ${project}` }),
            });
            if (!reportRes.ok) throw new Error('Report service down');
            const reportData: any = await reportRes.json();
            resultText = reportData.reportUrl ? `Report ready: ${reportData.reportUrl}` : 'Report generation failed.';
            break;
          }
          case 'clock_in': {
            const clockRes = await fetch(`http://localhost:${PORT}/api/time-entries/clock-in`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ userId, projectId: '', latitude: 0, longitude: 0 }),
            });
            if (!clockRes.ok) throw new Error('Time service down');
            resultText = 'You are now clocked in. Have a great shift!';
            break;
          }
          case 'clock_out': {
            const clockRes = await fetch(`http://localhost:${PORT}/api/time-entries/clock-out`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ userId, timeEntryId: '', latitude: 0, longitude: 0 }),
            });
            if (!clockRes.ok) throw new Error('Time service down');
            resultText = 'You are clocked out. See you tomorrow!';
            break;
          }
          case 'list_timesheet': {
            const days = args.days || 7;
            const endDate = new Date();
            const startDate = new Date(); startDate.setDate(endDate.getDate() - days);
            const timesheetRes = await fetch(`http://localhost:${PORT}/api/time-entries?userId=${userId}&start=${formatDate(startDate)}&end=${formatDate(endDate)}`, { headers: { Authorization: authHeader } });
            if (!timesheetRes.ok) throw new Error('Timesheet service down');
            const entries: any = await timesheetRes.json();
            const count = (entries.entries || []).length;
            resultText = `You have ${count} time entries in the last ${days} days.`;
            break;
          }
          case 'list_projects': {
            const projectRes = await fetch(`http://localhost:${PORT}/api/projects`, { headers: { Authorization: authHeader } });
            if (!projectRes.ok) throw new Error('Project service down');
            const projects: any = await projectRes.json();
            const names = (projects.projects || []).map((p: any) => p.name).join(', ');
            resultText = names ? `Active projects: ${names}` : 'No active projects found.';
            break;
          }
          case 'create_project': {
            const { name, client_name } = args;
            const createRes = await fetch(`http://localhost:${PORT}/api/projects`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ name, client_name }),
            });
            if (!createRes.ok) throw new Error('Project creation failed');
            resultText = `Project '${name}' created successfully.`;
            break;
          }
          case 'list_tasks': {
            const statusFilter = args.status || '';
            const taskRes = await fetch(`http://localhost:${PORT}/api/tasks`, { headers: { Authorization: authHeader } });
            if (!taskRes.ok) throw new Error('Task service down');
            const tasks: any = await taskRes.json();
            const taskList = (tasks.tasks || []).filter((t: any) => !statusFilter || t.status === statusFilter);
            const summary = taskList.map((t: any) => `${t.description} (${t.status})`).join(', ');
            resultText = summary ? `Tasks: ${summary}` : 'No tasks found.';
            break;
          }
          case 'create_task': {
            const { description, assigned_to } = args;
            const taskRes = await fetch(`http://localhost:${PORT}/api/tasks`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ description, assigned_to }),
            });
            if (!taskRes.ok) throw new Error('Task creation failed');
            resultText = `Task '${description}' added.`;
            break;
          }
          case 'request_pto': {
            const { start_date, end_date, type } = args;
            const ptoRes = await fetch(`http://localhost:${PORT}/api/pto`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ start_date, end_date, type, userId }),
            });
            if (!ptoRes.ok) throw new Error('PTO request failed');
            resultText = `PTO request submitted for ${start_date} to ${end_date}.`;
            break;
          }
          case 'list_pto': {
            const ptoRes = await fetch(`http://localhost:${PORT}/api/pto`, { headers: { Authorization: authHeader } });
            if (!ptoRes.ok) throw new Error('PTO service down');
            const ptoData: any = await ptoRes.json();
            const count = (ptoData.requests || []).length;
            resultText = `You have ${count} PTO request(s).`;
            break;
          }
          case 'get_crew_location': {
            const crewRes = await fetch(`http://localhost:${PORT}/api/crew`, { headers: { Authorization: authHeader } });
            if (!crewRes.ok) throw new Error('Crew service down');
            const crewData: any = await crewRes.json();
            const locations = (crewData.crew || []).map((c: any) => `${c.name}: lat ${c.latitude}, lng ${c.longitude}`).join('; ');
            resultText = locations ? `Crew locations: ${locations}` : 'No crew location data.';
            break;
          }
          case 'send_chat': {
            const { message, room } = args;
            const chatRes = await fetch(`http://localhost:${PORT}/api/chat/message`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ roomId: room, message }),
            });
            if (!chatRes.ok) throw new Error('Chat service down');
            resultText = 'Message sent.';
            break;
          }
          default: resultText = 'Command executed.';
        }
      } catch (innerErr: any) {
        // TEMPORARY DEBUG – will be removed after fixing
        resultText = `Debug: ${name} error: ${innerErr.message}`;
        console.error(`Lucy function error (${name}):`, innerErr.message);
      }

      // Save Lucy's reply
      if (userId) await pool.query('INSERT INTO lucy_conversations (user_id, role, content) VALUES ($1,$2,$3)', [userId, 'assistant', resultText]);
      return res.json([{ text: resultText }]);
    }

    // Plain text reply
    const reply = choice.message?.content || "I'm not sure how to help with that.";
    if (userId) await pool.query('INSERT INTO lucy_conversations (user_id, role, content) VALUES ($1,$2,$3)', [userId, 'assistant', reply]);
    return res.json([{ text: reply }]);
  } catch (error: any) {
    console.error('Lucy AI error:', error.message);
    res.status(500).json({ success: false, message: 'Lucy is taking a break.' });
  }
});

// Helper: format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// 404 & error handler
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err: Error, req: Request, res: Response, next: NextFunction) => { console.error(err); res.status(500).json({ success: false, message: 'Internal server error' }); });

// ----- WebSocket Server -----
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('🔌 New WebSocket connection:', socket.id);
  socket.on('join-room', (roomId) => { socket.join(`room-${roomId}`); console.log(`Socket ${socket.id} joined room-${roomId}`); });
  socket.on('leave-room', (roomId) => { socket.leave(`room-${roomId}`); console.log(`Socket ${socket.id} left room-${roomId}`); });
  socket.on('chat-message', async (data) => {
    try { const saved = await saveMessage(data.senderId, data.roomId, data.message, data.companyId); io.to(`room-${data.roomId}`).emit('new-message', saved); }
    catch (err) { console.error('Chat message error:', err); }
  });
});

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
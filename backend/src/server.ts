// ============================================
// FUTURE JOBS PRO AI – BACKEND SERVER
// Created by: Samuel B.
// ============================================

import express, { Express, Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './config/database';

// --------------------------------------------------------
// Import routers – match your actual filenames exactly
// --------------------------------------------------------
import voiceRouter from './routes/voiceRoutes';          // exists
import assistantRouter from './routes/assistantRoutes';  // your file is named 'assistantrouter.ts'
import aiRouter from './routes/aiRoutes';               // your file is named 'airouter.ts'
import chatbotRoutes from './routes/chatbotRoutes';      // we created this

// --------------------------------------------------------
// Other routers – uncomment when files exist
// --------------------------------------------------------
// import authRouter from './routes/authRouter';
// import userRouter from './routes/userRouter';
// import projectRouter from './routes/projectRouter';
// import timeEntryRouter from './routes/timeEntryRouter';
// import supportRouter from './routes/supportRouter';

// Load environment variables
dotenv.config();

const app: Express = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: '*', // restrict in production
    methods: ['GET', 'POST'],
  },
});

// ------------------------------
// Middleware
// ------------------------------
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging (optional)
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// Attach io instance to the app for use in routes
app.set('io', io);

// ------------------------------
// Routes (only those we have)
// ------------------------------
app.use('/api/voice', voiceRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/ai', aiRouter);
app.use('/api/chatbot', chatbotRoutes);

// Uncomment when you have these routers:
// app.use('/api/auth', authRouter);
// app.use('/api/users', userRouter);
// app.use('/api/projects', projectRouter);
// app.use('/api/time-entries', timeEntryRouter);
// app.use('/support', supportRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ------------------------------
// Socket.io
// ------------------------------
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // Join a room
  socket.on('join-room', (roomId: string) => {
    socket.join(roomId);
    console.log(`📢 ${socket.id} joined room: ${roomId}`);
  });

  // Leave a room
  socket.on('leave-room', (roomId: string) => {
    socket.leave(roomId);
    console.log(`🚪 ${socket.id} left room: ${roomId}`);
  });

  // Chat message
  socket.on('chat-message', (data) => {
    const { roomId, senderId, companyId, message } = data;
    io.to(roomId).emit('new-message', {
      id: `socket-${Date.now()}`,
      sender_id: senderId,
      message,
      created_at: new Date().toISOString(),
    });
    console.log(`💬 [${roomId}] ${senderId}: ${message}`);
  });

  // Human support request (from user)
  socket.on('request-human', (data) => {
    const { userId, userName } = data;
    io.to('support').emit('human-requested', {
      userId,
      userName,
      timestamp: new Date().toISOString(),
    });
    console.log(`🆘 Human support requested by ${userName || userId}`);
  });

  // Agent status change
  socket.on('agent-status-change', (data) => {
    const { active } = data;
    io.to('support').emit('agent-status', { active });
    console.log(`👤 Agent status changed: ${active ? 'online' : 'offline'}`);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// ------------------------------
// Start server
// ------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await pool.end();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export { app, server, io };
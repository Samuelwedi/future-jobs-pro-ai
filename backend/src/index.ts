import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

// ----- Health Check (no database) -----
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: 'Future Jobs Pro AI',
  });
});

app.get('/', (req, res) => res.send('<h1>🚀 Future Jobs Pro AI</h1>'));

// ----- Start Server -----
const server = http.createServer(app);
server.listen(parseInt(PORT as string) || 5000, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
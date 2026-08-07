import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initSocket } from './socket.js';
import { keywordsRouter } from './routes/keywords.js';
import { topicsRouter } from './routes/topics.js';
import { alertsRouter } from './routes/alerts.js';
import { sourcesRouter } from './routes/sources.js';
import { settingsRouter } from './routes/settings.js';
import { statsRouter } from './routes/stats.js';
import { agentRouter } from './routes/agent.js';
import { startScheduler, triggerCrawl, getCrawlStatus } from './crawlers/scheduler.js';

const PORT = parseInt(process.env.PORT || '3456');

const app = express();
const httpServer = createServer(app);

// ── Middleware ──
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// ── Routes ──
app.use('/api/v1/keywords', keywordsRouter);
app.use('/api/v1/topics', topicsRouter);
app.use('/api/v1/alerts', alertsRouter);
app.use('/api/v1/sources', sourcesRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/agent', agentRouter);

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Manual crawl trigger ──
app.post('/api/v1/crawl/trigger', async (_req, res) => {
  try {
    const result = await triggerCrawl();
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.json({ success: true, topicsFound: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/crawl/status — current scan progress (polled by the UI)
app.get('/api/v1/crawl/status', (_req, res) => {
  res.json(getCrawlStatus());
});

// ── Socket.io ──
initSocket(httpServer);

// ── Start ──
httpServer.listen(PORT, () => {
  console.log(`[HotMonitor] Server running on http://localhost:${PORT}`);
  console.log(`[HotMonitor] Socket.io ready for connections`);

  // Start crawler scheduler
  startScheduler();
});

export { app, httpServer };

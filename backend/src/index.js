'use strict';
import 'dotenv/config';
import './config/env.js';

import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDB } from './config/db.js';
import redisClient from './config/redis.js';
import { initSocket } from './sockets/index.js';
import { startReminderJobs } from './jobs/reminderJob.js';

// Route imports
import authRoutes         from './routes/auth.js';
import userRoutes         from './routes/users.js';
import medicationRoutes   from './routes/medications.js';
import taskRoutes         from './routes/tasks.js';
import notificationRoutes from './routes/notifications.js';
import aiRoutes           from './routes/ai.js';
import dashboardRoutes    from './routes/dashboard.js';
import reportsRoutes      from './routes/reports.js';   // Phase 5 Task 7
import notesRoutes        from './routes/notes.js';     // Phase 5 Task 8
import eldersRoutes       from './routes/elders.js';
import alertsRoutes       from './routes/alerts.js';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.ELDER_APP_URL,
  process.env.CAREGIVER_APP_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static Files — Avatar Uploads ───────────────────────────────────────────
// Serves uploaded avatar images at /uploads/avatars/<filename>
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Health Check ─────────────────────────────────────────────────────────────
/**
 * @route  GET /health
 * @desc   Simple health check endpoint
 * @access Public
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/medications',   medicationRoutes);
app.use('/api/tasks',         taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai',            aiRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/reports',       reportsRoutes);   // Phase 5 Task 7
app.use('/api/notes',         notesRoutes);     // Phase 5 Task 8
app.use('/api/elders',        eldersRoutes);
app.use('/api/alerts',        alertsRoutes);

// ─── 404 Fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

/**
 * Bootstrap the application:
 *  1. Connect to MongoDB
 *  2. Create HTTP server and attach Socket.io
 *  3. Start cron reminder jobs
 *  4. Listen on PORT
 */
async function bootstrap() {
  try {
    await connectDB();

    // Redis client is created lazily; log its status
    redisClient.on('ready', () => console.log('[Redis] Connected'));

    const server = http.createServer(app);
    initSocket(server);

    startReminderJobs();

    server.listen(PORT, () => {
      console.log(`[Server] ElderEase API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('[Bootstrap] Fatal error:', err);
    process.exit(1);
  }
}

bootstrap();

export default app;

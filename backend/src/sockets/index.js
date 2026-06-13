'use strict';
import { Server } from 'socket.io';

/** Shared Socket.io server instance (exported for use in other modules). */
export let io = null;

/**
 * Initialize the Socket.io server and attach it to the HTTP server.
 * Sets up join-room logic and exports emit helpers.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server instance
 * @returns {import('socket.io').Server} The initialized Socket.io instance
 */
export function initSocket(httpServer) {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    process.env.ELDER_APP_URL,
    process.env.CAREGIVER_APP_URL,
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    console.log(`[Socket.io] Client connected — ID: ${socket.id} | IP: ${clientIp}`);

    // ── join ────────────────────────────────────────────────────────────────
    /**
     * Client emits 'join' to enter their personal room.
     * @event join
     * @param {{ userId: string, role: string }} data
     */
    socket.on('join', ({ userId, role } = {}) => {
      if (!userId) {
        console.warn(`[Socket.io] 'join' event received without userId — socket: ${socket.id}`);
        return;
      }
      socket.join(userId);
      console.log(`[Socket.io] User ${userId} (${role || 'unknown'}) joined room`);
      socket.emit('joined', { userId, room: userId });
    });

    // ── join:caregiver ──────────────────────────────────────────────────────
    socket.on('join:caregiver', ({ caregiverId } = {}) => {
      if (!caregiverId) return;
      socket.join(caregiverId);
      console.log(`[Socket.io] Caregiver ${caregiverId} joined caregiver room`);
    });

    // ── join:elder ──────────────────────────────────────────────────────────
    socket.on('join:elder', ({ elderId, caregiverId } = {}) => {
      if (!elderId) return;
      socket.join(elderId);
      console.log(`[Socket.io] Caregiver ${caregiverId || ''} joined room for elder: ${elderId}`);
    });

    // ── disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected — ID: ${socket.id} | Reason: ${reason}`);
    });

    // ── error ───────────────────────────────────────────────────────────────
    socket.on('error', (err) => {
      console.error(`[Socket.io] Socket error — ID: ${socket.id}`, err.message);
    });
  });

  console.log('[Socket.io] Initialized and listening for connections');
  return io;
}

// ─── Emit Helpers ─────────────────────────────────────────────────────────────

/**
 * Emit a Socket.io event to a specific user's room.
 *
 * @param {string} userId - The MongoDB user ID (used as room name)
 * @param {string} event - The event name
 * @param {*} data - The event payload
 */
export function emitToUser(userId, event, data) {
  if (!io) {
    console.warn(`[Socket.io] emitToUser called before init — event: ${event}, userId: ${userId}`);
    return;
  }
  io.to(userId).emit(event, data);
}

/**
 * Emit a Socket.io event to ALL connected clients.
 *
 * @param {string} event - The event name
 * @param {*} data - The event payload
 */
export function emitToAll(event, data) {
  if (!io) {
    console.warn(`[Socket.io] emitToAll called before init — event: ${event}`);
    return;
  }
  io.emit(event, data);
}

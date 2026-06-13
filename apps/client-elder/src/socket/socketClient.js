import { io } from 'socket.io-client'

/** @type {import('socket.io-client').Socket|null} */
let socket = null

/**
 * Initialize and connect the Socket.IO client.
 * Authenticates with the stored JWT token and joins the elder's room.
 * @param {string} userId - The elder's user ID for room joining
 * @returns {import('socket.io-client').Socket} The connected socket instance
 */
export const connectSocket = (userId) => {
  if (socket?.connected) {
    console.log('[Socket] Already connected:', socket.id)
    return socket
  }

  const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
  socket = io(socketUrl, {
    auth: {
      token: localStorage.getItem('token'),
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  })

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id)
    socket.emit('join', { userId, role: 'elder' })
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
  })

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message)
  })

  return socket
}

/**
 * Get the current socket instance (may be null if not connected).
 * @returns {import('socket.io-client').Socket|null}
 */
export const getSocket = () => socket

/**
 * Disconnect the socket and clean up.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
    console.log('[Socket] Disconnected and cleaned up.')
  }
}

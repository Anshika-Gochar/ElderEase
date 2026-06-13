import { io } from 'socket.io-client'
import { store } from '../store/index.js'
import { addAlert, addAnomalyAlert } from '../store/slices/alertSlice.js'
import { updateTaskCompletion, fetchElderDashboard } from '../store/slices/elderSlice.js'
import { pushRealtimeEvent, incrementAdherenceTaken } from '../store/slices/dashboardSlice.js'

/** @type {import('socket.io-client').Socket | null} */
let socket = null

/**
 * Connect to the ElderEase WebSocket server as a caregiver.
 * Joins the caregiver's own room and subscribes to all linked elder rooms.
 * Listens for SOS, anomaly, medication, and task events.
 *
 * @param {string} caregiverId - The logged-in caregiver's MongoDB _id
 * @param {string[]} elderIds  - Array of linked elder _ids to subscribe to
 * @returns {import('socket.io-client').Socket} The connected socket instance
 */
export const connectSocket = (caregiverId, elderIds = []) => {
  if (socket) {
    console.log('[Socket] Socket already initialized, checking connection status')
    if (socket.connected) {
      // Already connected, emit join:elder events immediately
      elderIds.forEach((elderId) => {
        socket.emit('join:elder', { elderId, caregiverId })
        console.log(`[Socket] Dynamically joined room for elder: ${elderId}`)
      })
    } else {
      // Still connecting, make sure we join elder rooms when connect fires
      socket.once('connect', () => {
        elderIds.forEach((elderId) => {
          socket.emit('join:elder', { elderId, caregiverId })
          console.log(`[Socket] Joined room for elder on connection: ${elderId}`)
        })
      })
    }
    return socket
  }

  const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
  socket = io(socketUrl, {
    auth: {
      token: localStorage.getItem('token'),
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  })

  // ── Connection lifecycle ────────────────────────────────────────────────────
  socket.on('connect', () => {
    console.log(`[Socket] Connected as caregiver: ${socket.id}`)

    // Join caregiver's own room (receives direct alerts)
    socket.emit('join', { userId: caregiverId, role: 'caregiver' })

    // Also join a dedicated caregiver room for backwards-compat events
    socket.emit('join:caregiver', { caregiverId })

    // Subscribe to each linked elder's room
    elderIds.forEach((elderId) => {
      socket.emit('join:elder', { elderId, caregiverId })
      console.log(`[Socket] Joined room for elder: ${elderId}`)
    })
  })

  socket.on('disconnect', (reason) => {
    console.warn(`[Socket] Disconnected: ${reason}`)
  })

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message)
  })

  // ── SOS Alert ──────────────────────────────────────────────────────────────
  socket.on('alert:sos', (payload) => {
    console.warn('[Socket] 🚨 SOS Alert received:', payload)
    store.dispatch(
      addAlert({
        ...payload,
        type: 'sos',
        severity: 'critical',
        receivedAt: new Date().toISOString(),
      })
    )
    store.dispatch(
      pushRealtimeEvent({
        type: 'sos',
        label: '🚨 SOS Alert triggered',
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )
    // Browser notification (if permission granted)
    if (Notification.permission === 'granted') {
      new Notification('🚨 ElderEase SOS Alert', {
        body: `${payload.elderName || 'Your elder'} has triggered an SOS!`,
        icon: '/favicon.svg',
        requireInteraction: true,
      })
    }
  })

  // Keep backwards compat with old 'sos:alert' event name
  socket.on('sos:alert', (payload) => socket.emit('alert:sos', payload))

  // ── Dose Taken ─────────────────────────────────────────────────────────────
  // Fires when an elder confirms they've taken a dose.
  // Updates the adherence chart optimistically + adds a success entry to the feed.
  socket.on('dose:taken', (payload) => {
    console.log('[Socket] ✅ Dose taken:', payload)

    // Optimistically update adherence %
    if (payload.medicationId) {
      store.dispatch(incrementAdherenceTaken({ medicationId: payload.medicationId }))
    }

    store.dispatch(
      addAlert({
        ...payload,
        type: 'dose_taken',
        severity: 'info',
        receivedAt: new Date().toISOString(),
      })
    )

    store.dispatch(
      pushRealtimeEvent({
        type: 'dose_taken',
        label: `💊 ${payload.elderName || 'Elder'} took ${payload.medicationName || 'medication'}`,
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )
  })

  // ── Missed Dose Alert ──────────────────────────────────────────────────────
  // Fires from the nightly sweep when a dose was not confirmed within 30 min.
  socket.on('alert:missed', (payload) => {
    console.warn('[Socket] 💊 Missed dose alert:', payload)
    store.dispatch(
      addAlert({
        ...payload,
        type: 'missed_dose',
        severity: 'medium',
        receivedAt: new Date().toISOString(),
      })
    )
    store.dispatch(
      pushRealtimeEvent({
        type: 'missed_meds',
        label: `⚠️ Missed: ${payload.medicationName || 'medication'} — ${payload.elderName || 'Elder'}`,
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )
    // Browser notification
    if (Notification.permission === 'granted') {
      new Notification('⚠️ Missed Dose Alert', {
        body: `${payload.elderName || 'Your elder'} missed ${payload.medicationName || 'a medication'}.`,
        icon: '/favicon.svg',
      })
    }
  })

  // Keep backwards compat with old 'med:missed' event name
  socket.on('med:missed', (payload) => {
    store.dispatch(
      addAlert({
        ...payload,
        type: 'missed_dose',
        severity: 'medium',
        receivedAt: new Date().toISOString(),
      })
    )
    store.dispatch(
      pushRealtimeEvent({
        type: 'missed_meds',
        label: `⚠️ Missed medication: ${payload.medicationName || 'Unknown'}`,
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )
  })

  // ── Anomaly Alert ─────────────────────────────────────────────────────
  // Fires from backend when anomaly detection flags an elder.
  // addAnomalyAlert updates BOTH alerts feed and anomalyFlags list.
  socket.on('alert:anomaly', (payload) => {
    console.warn('[Socket] ⚠️ Anomaly alert:', payload)
    store.dispatch(addAnomalyAlert({
      ...payload,
      receivedAt: new Date().toISOString(),
    }))
    store.dispatch(
      pushRealtimeEvent({
        type:      'anomaly',
        label:     `⚠️ Anomaly: ${payload.message || payload.type || 'Unusual behaviour detected'}`,
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )
    // Browser notification
    if (Notification.permission === 'granted') {
      new Notification('⚠️ ElderEase Anomaly Detected', {
        body: payload.message || 'Unusual behaviour pattern detected for your elder.',
        icon: '/favicon.svg',
      })
    }
  })

  // ── Task Completed ─────────────────────────────────────────────────────────
  socket.on('task:completed', (payload) => {
    console.log('[Socket] ✅ Task completed:', payload)
    store.dispatch(updateTaskCompletion(payload))
    store.dispatch(
      pushRealtimeEvent({
        type: 'task_completed',
        label: `✅ Task completed: ${payload.taskTitle || 'Task'}`,
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )
  })

  // ── Low Mood Alert ─────────────────────────────────────────────────────────
  socket.on('mood:low', (payload) => {
    console.warn('[Socket] 😞 Low mood detected:', payload)
    store.dispatch(
      addAlert({
        ...payload,
        type: 'low_mood',
        severity: 'medium',
        receivedAt: new Date().toISOString(),
      })
    )
    store.dispatch(
      pushRealtimeEvent({
        type: 'low_mood',
        label: `😞 Low mood: score ${payload.score}/10`,
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )
  })

  // ── Mood Updated ─────────────────────────────────────────────────────────
  // Fires from backend ai.js on every Saathi chat exchange.
  // Pushes a feed event + refreshes the dashboard mood chart in real time.
  socket.on('mood:updated', (payload) => {
    console.log('[Socket] 💚 Mood updated:', payload)

    const scoreLabel =
      payload.moodScore >= 7 ? '😊 Good'
      : payload.moodScore >= 4 ? '😐 Neutral'
      : '😔 Low'

    store.dispatch(
      pushRealtimeEvent({
        type:      'mood_update',
        label:     `💚 Mood updated: ${Number(payload.moodScore).toFixed(1)}/10 (${scoreLabel})`,
        elderName: payload.elderName,
        timestamp: new Date().toISOString(),
      })
    )

    // Re-fetch dashboard so MoodChart reflects the latest score
    const state = store.getState()
    const selectedElder = state.elder?.selectedElder
    if (selectedElder?._id && selectedElder._id === payload.elderId) {
      store.dispatch(fetchElderDashboard(selectedElder._id))
    }
  })

  return socket
}

/**
 * Join elder rooms after linking a new elder (without reconnecting).
 * @param {string} elderId
 * @param {string} caregiverId
 */
export const joinElderRoom = (elderId, caregiverId) => {
  if (socket?.connected) {
    socket.emit('join:elder', { elderId, caregiverId })
    console.log(`[Socket] Joined new elder room: ${elderId}`)
  }
}

/**
 * Disconnect the socket cleanly (call on logout).
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
    console.log('[Socket] Disconnected and cleaned up')
  }
}

/**
 * Get the current socket instance (may be null if not connected).
 * @returns {import('socket.io-client').Socket | null}
 */
export const getSocket = () => socket

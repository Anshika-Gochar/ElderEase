// apps/client-caregiver/src/store/slices/alertSlice.js  MODIFY
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axiosInstance from '../../api/axiosConfig.js'

// ─── Async Thunks ─────────────────────────────────────────────────────────────

/**
 * Fetch all alerts for the caregiver's linked elders.
 * GET /api/alerts
 */
export const fetchAlerts = createAsyncThunk(
  'alerts/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get('/alerts', { params })
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch alerts')
    }
  }
)

/**
 * Fetch the SOS history from the Phase 5 endpoint.
 * GET /api/notifications/sos/history?limit=20
 */
export const fetchSosHistory = createAsyncThunk(
  'alerts/fetchSosHistory',
  async (_arg, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get('/notifications/sos/history', {
        params: { limit: 20 },
      })
      return Array.isArray(data) ? data : []
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch SOS history')
    }
  }
)

/**
 * Mark an alert as read/resolved.
 * PATCH /api/alerts/:id/read
 * @param {string} id - Alert ID
 */
export const markAlertRead = createAsyncThunk(
  'alerts/markRead',
  async (id, { rejectWithValue }) => {
    try {
      await axiosInstance.patch(`/alerts/${id}/read`)
      return id
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to mark alert read')
    }
  }
)

/**
 * Mark an SOS alert as resolved.
 * PATCH /api/notifications/sos/:id/resolve
 * @param {string} id - SOS alert ID
 */
export const resolveSosAlert = createAsyncThunk(
  'alerts/resolveSos',
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.patch(`/notifications/sos/${id}/resolve`)
      return { id, ...data }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to resolve SOS')
    }
  }
)

/**
 * Fetch anomaly flags for an elder.
 * GET /api/ai/anomaly/:elderId
 * @param {string} elderId
 */
export const fetchAnomalyFlags = createAsyncThunk(
  'alerts/fetchAnomalyFlags',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get(`/ai/anomaly/${elderId}`)
      return Array.isArray(data?.flags) ? data.flags : []
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to fetch anomaly flags')
    }
  }
)

/**
 * Resolve an anomaly flag.
 * PATCH /api/ai/anomaly/:anomalyId/resolve
 * @param {string} anomalyId
 */
export const resolveAnomalyFlag = createAsyncThunk(
  'alerts/resolveAnomalyFlag',
  async (anomalyId, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.patch(`/ai/anomaly/${anomalyId}/resolve`)
      return { anomalyId, ...data }
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to resolve anomaly flag')
    }
  }
)

/**
 * Trigger anomaly detection for an elder on demand.
 * POST /api/ai/anomaly/detect
 * @param {string} elderId
 */
export const runAnomalyDetect = createAsyncThunk(
  'alerts/runAnomalyDetect',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post('/ai/anomaly/detect', { elderId })
      return data   // { anomalies, alertsCreated, payload }
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Anomaly check failed')
    }
  }
)

// ─── Slice ────────────────────────────────────────────────────────────────────

const alertSlice = createSlice({
  name: 'alerts',
  initialState: {
    alerts:        [],
    sosHistory:    [],
    unreadCount:   0,
    loading:       false,
    error:         null,

    // ── Anomaly flags state ────────────────────────────────────────────────
    anomalyFlags:   [],      // AnomalyFlag docs from AI service
    anomalyLoading: false,   // fetching or resolving
    anomalyError:   null,    // string | null
    detectRunning:  false,   // POST /anomaly/detect in flight
  },
  reducers: {
    /**
     * Prepend a real-time alert from a socket event.
     * Increments unreadCount so the sidebar badge updates.
     */
    addAlert(state, action) {
      state.alerts.unshift({ ...action.payload, read: false })
      state.unreadCount += 1
    },

    /** Reset unreadCount to 0 — call when user navigates to AlertsPage. */
    resetUnread(state) {
      state.unreadCount = 0
    },

    /** Clear all alerts from state (e.g. on logout). */
    clearAlerts(state) {
      state.alerts        = []
      state.unreadCount   = 0
      state.anomalyFlags  = []
    },

    /** Manually decrement unread count. */
    decrementUnread(state) {
      if (state.unreadCount > 0) state.unreadCount -= 1
    },

    /**
     * Handle incoming ALERT_ANOMALY socket event.
     * Prepends a new anomaly alert and bumps unreadCount.
     * If the anomaly matches an existing flag it won't duplicate.
     */
    addAnomalyAlert(state, action) {
      // Prepend to alerts feed
      state.alerts.unshift({
        ...action.payload,
        read:      false,
        type:      action.payload.type || 'anomaly',
        createdAt: action.payload.detectedAt || new Date().toISOString(),
      })
      state.unreadCount += 1

      // Also prepend to anomalyFlags if not already there
      const exists = state.anomalyFlags.some(
        (f) => f.type === action.payload.type && f.resolvedAt == null
      )
      if (!exists) {
        state.anomalyFlags.unshift({
          _id:       action.payload.anomalyId || `live-${Date.now()}`,
          elderId:   action.payload.elderId,
          type:      action.payload.type,
          severity:  action.payload.severity,
          details:   action.payload.details || {},
          resolvedAt: null,
          createdAt:  action.payload.detectedAt || new Date().toISOString(),
        })
      }
    },

    /** Directly set anomaly flags (used by AnomalyPanel after detect run). */
    setAnomalyFlags(state, action) {
      state.anomalyFlags = action.payload
    },
  },
  extraReducers: (builder) => {
    // ── fetchAlerts ──────────────────────────────────────────────────────────
    builder
      .addCase(fetchAlerts.pending, (state) => {
        state.loading = true
        state.error   = null
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.loading    = false
        state.alerts     = action.payload.alerts      || []
        state.unreadCount = action.payload.unreadCount || 0
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.loading = false
        state.error   = action.payload
      })

    // ── fetchSosHistory ──────────────────────────────────────────────────────
    builder.addCase(fetchSosHistory.fulfilled, (state, action) => {
      state.sosHistory = action.payload
    })

    // ── markAlertRead ────────────────────────────────────────────────────────
    builder.addCase(markAlertRead.fulfilled, (state, action) => {
      const alert = state.alerts.find((a) => a._id === action.payload)
      if (alert && !alert.read) {
        alert.read = true
        if (state.unreadCount > 0) state.unreadCount -= 1
      }
    })

    // ── resolveSosAlert ──────────────────────────────────────────────────────
    builder.addCase(resolveSosAlert.fulfilled, (state, action) => {
      // Update in alerts feed
      const alert = state.alerts.find((a) => a._id === action.payload.id)
      if (alert) { alert.resolved = true; alert.read = true; alert.isRead = true }
      // Update in sosHistory
      const sos = state.sosHistory.find((s) => s._id === action.payload.id)
      if (sos) { sos.isRead = true; sos.resolved = true }
    })

    // ── fetchAnomalyFlags ────────────────────────────────────────────────────
    builder
      .addCase(fetchAnomalyFlags.pending, (state) => {
        state.anomalyLoading = true
        state.anomalyError   = null
      })
      .addCase(fetchAnomalyFlags.fulfilled, (state, action) => {
        state.anomalyLoading = false
        state.anomalyFlags   = action.payload
      })
      .addCase(fetchAnomalyFlags.rejected, (state, action) => {
        state.anomalyLoading = false
        state.anomalyError   = action.payload
      })

    // ── resolveAnomalyFlag ───────────────────────────────────────────────────
    builder
      .addCase(resolveAnomalyFlag.pending, (state) => {
        state.anomalyLoading = true
      })
      .addCase(resolveAnomalyFlag.fulfilled, (state, action) => {
        state.anomalyLoading = false
        // Remove from list (it's now resolved)
        state.anomalyFlags = state.anomalyFlags.filter(
          (f) => f._id !== action.payload.anomalyId
        )
      })
      .addCase(resolveAnomalyFlag.rejected, (state, action) => {
        state.anomalyLoading = false
        state.anomalyError   = action.payload
      })

    // ── runAnomalyDetect ─────────────────────────────────────────────────────
    builder
      .addCase(runAnomalyDetect.pending, (state) => {
        state.detectRunning = true
        state.anomalyError  = null
      })
      .addCase(runAnomalyDetect.fulfilled, (state, action) => {
        state.detectRunning = false
        // Merge newly detected anomalies into anomalyFlags (prepend new ones)
        const newFlags = action.payload.anomalies || []
        for (const flag of newFlags) {
          const exists = state.anomalyFlags.some((f) => f._id === flag._id)
          if (!exists) {
            state.anomalyFlags.unshift(flag)
          }
        }
      })
      .addCase(runAnomalyDetect.rejected, (state, action) => {
        state.detectRunning = false
        state.anomalyError  = action.payload
      })
  },
})

export const {
  addAlert,
  resetUnread,
  clearAlerts,
  decrementUnread,
  addAnomalyAlert,
  setAnomalyFlags,
} = alertSlice.actions

// ── Selectors ──────────────────────────────────────────────────────────────────
export const selectAlerts         = (state) => state.alerts.alerts
export const selectUnreadCount    = (state) => state.alerts.unreadCount
export const selectSosHistory     = (state) => state.alerts.sosHistory
export const selectAlertsLoading  = (state) => state.alerts.loading
export const selectAnomalyFlags   = (state) => state.alerts.anomalyFlags
export const selectAnomalyLoading = (state) => state.alerts.anomalyLoading
export const selectAnomalyError   = (state) => state.alerts.anomalyError
export const selectDetectRunning  = (state) => state.alerts.detectRunning

export default alertSlice.reducer

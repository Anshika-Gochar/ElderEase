import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axiosInstance from '../../api/axiosConfig.js'

// ─── Async Thunks ─────────────────────────────────────────────────────────────

/**
 * Fetch per-medication adherence stats for a specific elder.
 * GET /api/medications/adherence/:elderId?days=14
 *
 * Returns an array of { medicationId, name, dose, color, taken, missed, adherencePct }
 * where adherencePct is null if no dose history exists yet.
 *
 * @param {string} elderId
 */
export const fetchAdherence = createAsyncThunk(
  'dashboard/fetchAdherence',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get(
        `/medications/adherence/${elderId}?days=14`
      )
      return data
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.error || 'Failed to fetch adherence data'
      )
    }
  }
)

// ─── Slice ────────────────────────────────────────────────────────────────────

/**
 * Dashboard UI state slice.
 * Manages AI digest, real-time event feed, sidebar state, and adherence data.
 */
const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: {
    aiDigest: null,
    digestLoading: false,
    digestError: null,
    realtimeFeed: [],       // live socket event feed (task completions, med taken, etc.)
    sidebarCollapsed: false,
    adherenceData: [],      // per-medication adherence — from fetchAdherence
    adherenceLoading: false,
    adherenceError: null,
  },
  reducers: {
    /**
     * Set AI digest text.
     * @param {{ payload: string }} action
     */
    setAiDigest(state, action) {
      state.aiDigest = action.payload
      state.digestError = null
    },
    setDigestLoading(state, action) {
      state.digestLoading = action.payload
    },
    setDigestError(state, action) {
      state.digestError = action.payload
      state.digestLoading = false
    },
    /**
     * Push a real-time socket event to the activity feed (prepend, cap at 50).
     * @param {{ payload: object }} action
     */
    pushRealtimeEvent(state, action) {
      state.realtimeFeed.unshift(action.payload)
      if (state.realtimeFeed.length > 50) state.realtimeFeed.pop()
    },
    clearRealtimeFeed(state) {
      state.realtimeFeed = []
    },
    /**
     * Bulk-seed the feed from historical data on mount (e.g. recent alerts,
     * task completions). Replaces the current feed so a page refresh doesn't
     * leave the panel permanently empty.
     * @param {{ payload: object[] }} action
     */
    seedRealtimeFeed(state, action) {
      state.realtimeFeed = action.payload.slice(0, 50)
    },
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    /**
     * Optimistically update adherence % for a single medication when a dose
     * is confirmed taken via socket event (dose:taken).
     * @param {{ payload: { medicationId: string } }} action
     */
    incrementAdherenceTaken(state, action) {
      const { medicationId } = action.payload
      const med = state.adherenceData.find(
        (m) => m.medicationId?.toString() === medicationId
      )
      if (med) {
        med.taken = (med.taken || 0) + 1
        const total = med.taken + (med.missed || 0)
        med.adherencePct = total > 0 ? Math.round((med.taken / total) * 100) : null
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdherence.pending, (state) => {
        state.adherenceLoading = true
        state.adherenceError = null
      })
      .addCase(fetchAdherence.fulfilled, (state, action) => {
        state.adherenceLoading = false
        state.adherenceData = action.payload
      })
      .addCase(fetchAdherence.rejected, (state, action) => {
        state.adherenceLoading = false
        state.adherenceError = action.payload
      })
  },
})

export const {
  setAiDigest,
  setDigestLoading,
  setDigestError,
  pushRealtimeEvent,
  clearRealtimeFeed,
  seedRealtimeFeed,
  toggleSidebar,
  incrementAdherenceTaken,
} = dashboardSlice.actions

// ── Selectors ──────────────────────────────────────────────────────────────────
export const selectAiDigest        = (state) => state.dashboard.aiDigest
export const selectDigestLoading   = (state) => state.dashboard.digestLoading
export const selectRealtimeFeed    = (state) => state.dashboard.realtimeFeed
export const selectSidebarCollapsed = (state) => state.dashboard.sidebarCollapsed
export const selectAdherenceData   = (state) => state.dashboard.adherenceData
export const selectAdherenceLoading = (state) => state.dashboard.adherenceLoading

export default dashboardSlice.reducer

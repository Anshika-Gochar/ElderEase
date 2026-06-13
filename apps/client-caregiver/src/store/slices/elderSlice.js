import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axiosInstance from '../../api/axiosConfig.js'

/**
 * Async thunk — Fetch all elders linked to the current caregiver.
 * GET /api/elders/linked
 */
export const fetchLinkedElders = createAsyncThunk(
  'elder/fetchLinked',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get('/elders/linked')
      return data.elders
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch elders')
    }
  }
)

/**
 * Async thunk — Select a specific elder and load their profile.
 * GET /api/elders/:elderId
 * @param {string} elderId
 */
export const selectElderById = createAsyncThunk(
  'elder/selectById',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get(`/elders/${elderId}`)
      return data.elder
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load elder')
    }
  }
)

/**
 * Async thunk — Fetch full dashboard data for a specific elder.
 * GET /api/dashboard/:elderId
 * @param {string} elderId
 */
export const fetchElderDashboard = createAsyncThunk(
  'elder/fetchDashboard',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get(`/dashboard/${elderId}`)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch dashboard data')
    }
  }
)

/**
 * Async thunk — Link a new elder to the caregiver by email or elder ID.
 * POST /api/elders/link
 * @param {{ email?: string, elderId?: string }} linkData
 */
export const linkElder = createAsyncThunk(
  'elder/link',
  async (linkData, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post('/elders/link', linkData)
      return data.elder
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to link elder')
    }
  }
)

const elderSlice = createSlice({
  name: 'elder',
  initialState: {
    elders: [],
    selectedElder: null,
    dashboardData: null,
    loading: false,
    dashboardLoading: false,
    error: null,
  },
  reducers: {
    /**
     * Manually set the selected elder (local state change without API call).
     * @param {object} state
     * @param {{ payload: object }} action
     */
    setSelectedElder(state, action) {
      state.selectedElder = action.payload
      state.dashboardData = null
    },
    /**
     * Update real-time task completion from socket events.
     * @param {object} state
     * @param {{ payload: object }} action
     */
    updateTaskCompletion(state, action) {
      if (state.dashboardData) {
        state.dashboardData.recentTasks = [
          action.payload,
          ...(state.dashboardData.recentTasks || []),
        ].slice(0, 20)
      }
    },
    clearElderError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch linked elders
    builder
      .addCase(fetchLinkedElders.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchLinkedElders.fulfilled, (state, action) => {
        state.loading = false
        state.elders = action.payload
        // Auto-select first elder if none selected
        if (!state.selectedElder && action.payload.length > 0) {
          state.selectedElder = action.payload[0]
        }
      })
      .addCase(fetchLinkedElders.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Select elder by ID
    builder
      .addCase(selectElderById.pending, (state) => {
        state.loading = true
      })
      .addCase(selectElderById.fulfilled, (state, action) => {
        state.loading = false
        state.selectedElder = action.payload
        state.dashboardData = null
      })
      .addCase(selectElderById.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Fetch elder dashboard
    builder
      .addCase(fetchElderDashboard.pending, (state) => {
        state.dashboardLoading = true
        state.error = null
      })
      .addCase(fetchElderDashboard.fulfilled, (state, action) => {
        state.dashboardLoading = false
        state.dashboardData = action.payload
      })
      .addCase(fetchElderDashboard.rejected, (state, action) => {
        state.dashboardLoading = false
        state.error = action.payload
      })

    // Link elder
    builder
      .addCase(linkElder.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(linkElder.fulfilled, (state, action) => {
        state.loading = false
        state.elders.push(action.payload)
      })
      .addCase(linkElder.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { setSelectedElder, updateTaskCompletion, clearElderError } = elderSlice.actions

// ── Selectors ──
/** @param {import('../index.js').RootState} state */
export const selectElders = (state) => state.elder.elders
/** @param {import('../index.js').RootState} state */
export const selectSelectedElder = (state) => state.elder.selectedElder
/** @param {import('../index.js').RootState} state */
export const selectDashboardData = (state) => state.elder.dashboardData
/** @param {import('../index.js').RootState} state */
export const selectElderLoading = (state) => state.elder.loading
/** @param {import('../index.js').RootState} state */
export const selectDashboardLoading = (state) => state.elder.dashboardLoading

export default elderSlice.reducer

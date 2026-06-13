import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../api/axiosConfig'

// ─── Async Thunks ────────────────────────────────────────────────────────────

/**
 * Fetch all active medications for the current elder user.
 * GET /api/medications
 */
export const fetchMedications = createAsyncThunk(
  'medications/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/medications')
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to fetch medications.')
    }
  }
)

/**
 * Fetch today's dose schedule (DoseLogs) for the current elder,
 * enriched with medication name/dose/color.
 * GET /api/medications/today/:elderId
 *
 * @param {string} elderId - The elder's MongoDB _id
 */
export const fetchTodayDoses = createAsyncThunk(
  'medications/fetchTodayDoses',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/medications/today/${elderId}`)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || "Failed to fetch today's doses.")
    }
  }
)

/**
 * Mark a specific scheduled dose as taken.
 * POST /api/medications/:medicationId/take  body: { scheduledTime }
 *
 * @param {{ medicationId: string, scheduledTime: string }} payload
 *   scheduledTime — ISO 8601 string of the scheduled dose (from DoseLog.scheduledAt)
 */
export const takeDose = createAsyncThunk(
  'medications/takeDose',
  async ({ medicationId, scheduledTime }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(`/medications/${medicationId}/take`, { scheduledTime })
      return { medicationId, scheduledTime, doseLog: data.doseLog }
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to record dose.')
    }
  }
)

/**
 * Add a new medication for the current elder.
 * POST /api/medications
 *
 * @param {{ name: string, dose: string, frequency: string, scheduledTimes: string[], color?: string, instructions?: string }} medData
 */
export const addMedication = createAsyncThunk(
  'medications/add',
  async (medData, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/medications', medData)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to add medication.')
    }
  }
)

/**
 * Update an existing medication by ID.
 * PATCH /api/medications/:id
 *
 * @param {{ id: string, updates: object }} payload
 */
export const updateMedication = createAsyncThunk(
  'medications/update',
  async ({ id, updates }, { rejectWithValue }) => {
    try {
      const { data } = await api.patch(`/medications/${id}`, updates)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to update medication.')
    }
  }
)

/**
 * Soft-delete a medication by ID.
 * DELETE /api/medications/:id
 *
 * @param {string} id - Medication ID
 */
export const deleteMedication = createAsyncThunk(
  'medications/delete',
  async (id, { rejectWithValue }) => {
    try {
      await api.delete(`/medications/${id}`)
      return id
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Failed to delete medication.')
    }
  }
)

// ─── Slice ───────────────────────────────────────────────────────────────────

const medSlice = createSlice({
  name: 'medications',
  initialState: {
    medications: [],
    todayDoses: [],
    /** Track per-dose in-flight state: key = `${medicationId}|${scheduledTime}` */
    takingDose: {},
    /** Per-dose inline error: same key as above */
    doseErrors: {},
    loading: false,
    error: null,
  },
  reducers: {
    clearMedError(state) {
      state.error = null
    },
    clearDoseError(state, action) {
      const key = action.payload
      delete state.doseErrors[key]
    },
    /**
     * Optimistically update a dose status from socket events.
     * Matches by medicationId — socket-driven update.
     */
    updateDoseByMedId(state, action) {
      const { medicationId, status } = action.payload
      const dose = state.todayDoses.find(
        (d) => d.medicationId?.toString() === medicationId
      )
      if (dose) dose.status = status
    },
  },
  extraReducers: (builder) => {
    // ── fetchMedications ──
    builder
      .addCase(fetchMedications.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchMedications.fulfilled, (state, action) => {
        state.loading = false
        state.medications = action.payload
      })
      .addCase(fetchMedications.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // ── fetchTodayDoses ──
    builder
      .addCase(fetchTodayDoses.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchTodayDoses.fulfilled, (state, action) => {
        state.loading = false
        state.todayDoses = action.payload
      })
      .addCase(fetchTodayDoses.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // ── takeDose ──
    builder
      .addCase(takeDose.pending, (state, action) => {
        const { medicationId, scheduledTime } = action.meta.arg
        const key = `${medicationId}|${scheduledTime}`
        state.takingDose[key] = true
        delete state.doseErrors[key]
      })
      .addCase(takeDose.fulfilled, (state, action) => {
        const { medicationId, scheduledTime } = action.payload
        const key = `${medicationId}|${scheduledTime}`
        delete state.takingDose[key]

        // Optimistically update the dose row to 'taken'
        const dose = state.todayDoses.find(
          (d) =>
            d.medicationId?.toString() === medicationId &&
            d.scheduledAt === scheduledTime
        )
        if (dose) {
          dose.status = 'taken'
          dose.takenAt = new Date().toISOString()
        }
      })
      .addCase(takeDose.rejected, (state, action) => {
        const { medicationId, scheduledTime } = action.meta.arg
        const key = `${medicationId}|${scheduledTime}`
        delete state.takingDose[key]
        state.doseErrors[key] = action.payload || 'Could not record dose.'
      })

    // ── addMedication ──
    builder
      .addCase(addMedication.fulfilled, (state, action) => {
        state.medications.unshift(action.payload)
      })
      .addCase(addMedication.rejected, (state, action) => {
        state.error = action.payload
      })

    // ── updateMedication ──
    builder
      .addCase(updateMedication.fulfilled, (state, action) => {
        const idx = state.medications.findIndex((m) => m._id === action.payload._id)
        if (idx !== -1) state.medications[idx] = action.payload
      })
      .addCase(updateMedication.rejected, (state, action) => {
        state.error = action.payload
      })

    // ── deleteMedication ──
    builder
      .addCase(deleteMedication.fulfilled, (state, action) => {
        state.medications = state.medications.filter((m) => m._id !== action.payload)
      })
      .addCase(deleteMedication.rejected, (state, action) => {
        state.error = action.payload
      })
  },
})

export const { clearMedError, clearDoseError, updateDoseByMedId } = medSlice.actions

// ─── Selectors ───────────────────────────────────────────────────────────────
/** @returns {Array} All active medications */
export const selectMedications = (state) => state.medications.medications
/** @returns {Array} Today's dose schedule, enriched with med info */
export const selectTodayDoses = (state) => state.medications.todayDoses
/** @returns {boolean} Global loading (medications list) */
export const selectMedLoading = (state) => state.medications.loading
/** @returns {object} Per-dose in-flight map */
export const selectTakingDose = (state) => state.medications.takingDose
/** @returns {object} Per-dose error map */
export const selectDoseErrors = (state) => state.medications.doseErrors
/** @returns {number} How many doses taken today */
export const selectTakenToday = (state) =>
  state.medications.todayDoses.filter((d) => d.status === 'taken').length

export default medSlice.reducer

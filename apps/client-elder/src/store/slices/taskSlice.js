import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../api/axiosConfig'

// ─── Async Thunks ────────────────────────────────────────────────────────────

/**
 * Fetch all tasks assigned to the current elder for today.
 */
export const fetchTasks = createAsyncThunk(
  'tasks/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/tasks')
      return data
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || 'Failed to fetch tasks.'
      )
    }
  }
)

/**
 * Mark a task as completed.
 * @param {string} taskId - The ID of the task to complete
 */
export const completeTask = createAsyncThunk(
  'tasks/complete',
  async (taskId, { rejectWithValue }) => {
    try {
      // Backend endpoint is POST /tasks/:id/complete (not PATCH)
      const { data } = await api.post(`/tasks/${taskId}/complete`)
      return { taskId, data }
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || 'Failed to complete task.'
      )
    }
  }
)

/**
 * Fetch the current completion streak for the elder.
 */
export const fetchStreak = createAsyncThunk(
  'tasks/fetchStreak',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/tasks/streak')
      return data.streak
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || 'Failed to fetch streak.'
      )
    }
  }
)

/**
 * Add a new task.
 * @param {{ title: string, category: string, scheduledTime?: string }} taskData
 */
export const addTask = createAsyncThunk(
  'tasks/add',
  async (taskData, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/tasks', taskData)
      return data
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || 'Failed to add task.'
      )
    }
  }
)

// ─── Slice ───────────────────────────────────────────────────────────────────

const taskSlice = createSlice({
  name: 'tasks',
  initialState: {
    tasks: [],
    streak: 0,
    loading: false,
    error: null,
  },
  reducers: {
    clearTaskError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // ── fetchTasks ──
    builder
      .addCase(fetchTasks.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchTasks.fulfilled, (state, action) => {
        state.loading = false
        state.tasks = action.payload
      })
      .addCase(fetchTasks.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // ── completeTask ──
    builder
      .addCase(completeTask.fulfilled, (state, action) => {
        // Mark the task as completed in local state immediately
        const { taskId } = action.payload
        const task = state.tasks.find((t) => t._id === taskId)
        if (task) {
          task.completed = true
          task.completedToday = true
        }
      })
      .addCase(completeTask.rejected, (state, action) => {
        state.error = action.payload
      })

    // ── fetchStreak ──
    builder
      .addCase(fetchStreak.fulfilled, (state, action) => {
        state.streak = action.payload
      })

    // ── addTask ──
    builder
      .addCase(addTask.fulfilled, (state, action) => {
        state.tasks.unshift(action.payload)
      })
      .addCase(addTask.rejected, (state, action) => {
        state.error = action.payload
      })
  },
})

export const { clearTaskError } = taskSlice.actions

// ─── Selectors ───────────────────────────────────────────────────────────────
/** @returns {Array} All tasks */
export const selectTasks = (state) => state.tasks.tasks
/** @returns {number} Current completion streak in days */
export const selectStreak = (state) => state.tasks.streak
/** @returns {boolean} Task loading state */
export const selectTaskLoading = (state) => state.tasks.loading
/**
 * Returns today's completion ratio as { done, total }.
 * @returns {{ done: number, total: number }}
 */
export const selectTodayProgress = (state) => {
  const tasks = state.tasks.tasks
  // Backend returns 'completedToday'; local optimistic update sets 'completed'
  const done = tasks.filter((t) => t.completed || t.completedToday).length
  return { done, total: tasks.length }
}

export default taskSlice.reducer

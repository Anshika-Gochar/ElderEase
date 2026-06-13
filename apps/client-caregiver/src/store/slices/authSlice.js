import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axiosInstance from '../../api/axiosConfig.js'

/**
 * Async thunk — Log in an existing caregiver.
 * POST /api/auth/login
 * @param {{ email: string, password: string }} credentials
 */
export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post('/auth/login', credentials)
      localStorage.setItem('token', data.token)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Login failed')
    }
  }
)

/**
 * Async thunk — Register a new caregiver account.
 * POST /api/auth/register
 * @param {{ name: string, email: string, password: string, phone: string }} userData
 */
export const registerUser = createAsyncThunk(
  'auth/register',
  async (userData, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.post('/auth/register', {
        ...userData,
        role: 'caregiver',
      })
      localStorage.setItem('token', data.token)
      return data
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Registration failed')
    }
  }
)

/**
 * Async thunk — Fetch the current authenticated user's profile.
 * GET /api/auth/me
 */
export const fetchCurrentUser = createAsyncThunk(
  'auth/me',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axiosInstance.get('/auth/me')
      return data
    } catch (err) {
      localStorage.removeItem('token')
      return rejectWithValue(err.response?.data?.message || 'Session expired')
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: localStorage.getItem('token') || null,
    loading: false,
    error: null,
    isAuthenticated: false,
  },
  reducers: {
    /**
     * Log out — clear token and user from state + localStorage.
     */
    logout(state) {
      state.user = null
      state.token = null
      state.isAuthenticated = false
      state.error = null
      localStorage.removeItem('token')
    },
    /**
     * Clear any auth error (e.g. on form reset).
     */
    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false
        state.token = action.payload.token
        state.user = action.payload.user
        state.isAuthenticated = true
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Register
    builder
      .addCase(registerUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false
        state.token = action.payload.token
        state.user = action.payload.user
        state.isAuthenticated = true
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // Fetch current user (session restore)
    builder
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.isAuthenticated = true
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.loading = false
        state.isAuthenticated = false
        state.token = null
      })
  },
})

export const { logout, clearError } = authSlice.actions

// ── Selectors ──
/** @param {import('../index.js').RootState} state */
export const selectUser = (state) => state.auth.user
/** @param {import('../index.js').RootState} state */
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated
/** @param {import('../index.js').RootState} state */
export const selectAuthLoading = (state) => state.auth.loading
/** @param {import('../index.js').RootState} state */
export const selectAuthError = (state) => state.auth.error

export default authSlice.reducer

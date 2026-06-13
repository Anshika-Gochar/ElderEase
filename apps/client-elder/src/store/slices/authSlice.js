import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../api/axiosConfig'

// ─── Async Thunks ────────────────────────────────────────────────────────────

/**
 * Authenticate an elder user with email + password.
 * Saves the JWT token to localStorage on success.
 * @param {{ email: string, password: string }} credentials
 */
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/login', credentials)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return data
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || 'Login failed. Please check your credentials.'
      )
    }
  }
)

/**
 * Register a new user account.
 * @param {{ name: string, email: string, password: string, role: string, phone?: string }} userData
 */
export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/register', userData)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return data
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || 'Registration failed. Please try again.'
      )
    }
  }
)

/**
 * Log out the current user and clear all persisted auth state.
 */
export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      // Notify backend to invalidate session if endpoint exists
      await api.post('/auth/logout').catch(() => {})
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
    return null
  }
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const storedUser = () => {
  try {
    const u = localStorage.getItem('user')
    return u ? JSON.parse(u) : null
  } catch {
    return null
  }
}

// ─── Slice ───────────────────────────────────────────────────────────────────

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser(),
    token: localStorage.getItem('token') || null,
    loading: false,
    error: null,
  },
  reducers: {
    /**
     * Manually set the user (e.g. after token refresh).
     * @param {object} action.payload - user object
     */
    setUser(state, action) {
      state.user = action.payload
    },
    /**
     * Clear all auth state (used for forced logout on 401).
     */
    clearAuth(state) {
      state.user = null
      state.token = null
      state.error = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    },
    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // ── loginUser ──
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.token = action.payload.token
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // ── registerUser ──
    builder
      .addCase(registerUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.token = action.payload.token
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

    // ── logoutUser ──
    builder
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null
        state.token = null
        state.loading = false
        state.error = null
      })
  },
})

export const { setUser, clearAuth, clearError } = authSlice.actions

// ─── Selectors ───────────────────────────────────────────────────────────────
/** @returns {object|null} The logged-in user object */
export const selectUser = (state) => state.auth.user
/** @returns {boolean} Whether a user is currently authenticated */
export const selectIsAuthenticated = (state) => !!state.auth.token
/** @returns {boolean} Whether an auth request is in flight */
export const selectAuthLoading = (state) => state.auth.loading
/** @returns {string|null} The current auth error message */
export const selectAuthError = (state) => state.auth.error

export default authSlice.reducer

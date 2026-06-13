// apps/client-elder/src/store/slices/chatSlice.js  MODIFY
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../api/axiosConfig'

// ─── Async Thunks ─────────────────────────────────────────────────────────────

/**
 * Fetch the last 50 chat messages for the authenticated elder.
 * GET /api/ai/chat/history
 */
export const fetchChatHistory = createAsyncThunk(
  'chat/fetchHistory',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/ai/chat/history?limit=50')
      return Array.isArray(data) ? data : (data.messages ?? [])
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.error || 'Failed to load chat history.'
      )
    }
  }
)

/**
 * Send a message to Saathi and optimistically add it to the UI.
 * POST /api/ai/chat
 *
 * Optimistic flow:
 *   pending   → push { role:'user', content } + typing placeholder
 *   fulfilled → replace typing placeholder with real AI response
 *   rejected  → remove typing placeholder, set error
 *
 * @param {string} text - The user's message
 */
export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (text, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/ai/chat/', { message: text })
      return { response: data.response, moodScore: data.moodScore }
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.error || 'Saathi is resting, please try again in a moment.'
      )
    }
  }
)

/**
 * Fetch 7-day mood history for the authenticated elder.
 * GET /api/ai/mood/:elderId
 *
 * @param {string} elderId - The elder's MongoDB _id
 */
export const fetchMood7Day = createAsyncThunk(
  'chat/fetchMood7Day',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/ai/mood/${elderId}`)
      return Array.isArray(data?.scores) ? data.scores : []
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.error || 'Failed to load mood data.'
      )
    }
  }
)

/**
 * Fetch 30-day mood history for the authenticated elder.
 * GET /api/ai/mood/:elderId/monthly
 *
 * @param {string} elderId - The elder's MongoDB _id
 */
export const fetchMoodMonthly = createAsyncThunk(
  'chat/fetchMoodMonthly',
  async (elderId, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/ai/mood/${elderId}/monthly`)
      return Array.isArray(data?.scores) ? data.scores : []
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.error || 'Failed to load monthly mood data.'
      )
    }
  }
)

// ─── Slice ────────────────────────────────────────────────────────────────────

const TYPING_PLACEHOLDER_ID = '__typing__'

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    /** @type {Array<{_id:string, role:string, content:string, createdAt:string, isTyping?:boolean}>} */
    messages:    [],
    isLoading:   false,   // true while fetchChatHistory is in flight
    isSending:   false,   // true while sendMessage is in flight
    error:       null,    // string | null

    // ── Mood history state ─────────────────────────────────────────────────
    moodWeek:    [],      // 7-day scores array  [{ date, score, sentimentLabel, ... }]
    moodMonthly: [],      // 30-day scores array [{ date, score, sentimentLabel, ... }]
    moodLoading: false,   // true while either mood fetch is in flight
    moodError:   null,    // string | null
  },
  reducers: {
    /**
     * Add a single message (e.g. from a socket event).
     * @param {{ role: string, content: string, _id?: string, createdAt?: string }} action.payload
     */
    addMessage(state, action) {
      state.messages.push(action.payload)
    },
    /** Clear all chat messages (e.g. on logout). */
    clearMessages(state) {
      state.messages = []
    },
    /** Dismiss the current chat error. */
    clearChatError(state) {
      state.error = null
    },
    /** Dismiss the current mood error. */
    clearMoodError(state) {
      state.moodError = null
    },
  },
  extraReducers: (builder) => {
    // ── fetchChatHistory ─────────────────────────────────────────────────────
    builder
      .addCase(fetchChatHistory.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchChatHistory.fulfilled, (state, action) => {
        state.isLoading = false
        state.messages = action.payload
      })
      .addCase(fetchChatHistory.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })

    // ── sendMessage ──────────────────────────────────────────────────────────
    builder
      .addCase(sendMessage.pending, (state, action) => {
        state.isSending = true
        state.error = null

        const userText = action.meta.arg

        state.messages.push({
          _id:       `temp-user-${Date.now()}`,
          role:      'user',
          content:   userText,
          createdAt: new Date().toISOString(),
        })

        state.messages.push({
          _id:       TYPING_PLACEHOLDER_ID,
          role:      'assistant',
          content:   '',
          createdAt: new Date().toISOString(),
          isTyping:  true,
        })
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.isSending = false

        const idx = state.messages.findIndex((m) => m._id === TYPING_PLACEHOLDER_ID)
        const realMessage = {
          _id:       `ai-${Date.now()}`,
          role:      'assistant',
          content:   action.payload.response,
          createdAt: new Date().toISOString(),
          isTyping:  false,
        }
        if (idx !== -1) {
          state.messages[idx] = realMessage
        } else {
          state.messages.push(realMessage)
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isSending = false
        state.error = action.payload
        state.messages = state.messages.filter(
          (m) => m._id !== TYPING_PLACEHOLDER_ID
        )
      })

    // ── fetchMood7Day ────────────────────────────────────────────────────────
    builder
      .addCase(fetchMood7Day.pending, (state) => {
        state.moodLoading = true
        state.moodError   = null
      })
      .addCase(fetchMood7Day.fulfilled, (state, action) => {
        state.moodLoading = false
        state.moodWeek    = action.payload
      })
      .addCase(fetchMood7Day.rejected, (state, action) => {
        state.moodLoading = false
        state.moodError   = action.payload
      })

    // ── fetchMoodMonthly ─────────────────────────────────────────────────────
    builder
      .addCase(fetchMoodMonthly.pending, (state) => {
        state.moodLoading = true
        state.moodError   = null
      })
      .addCase(fetchMoodMonthly.fulfilled, (state, action) => {
        state.moodLoading  = false
        state.moodMonthly  = action.payload
      })
      .addCase(fetchMoodMonthly.rejected, (state, action) => {
        state.moodLoading = false
        state.moodError   = action.payload
      })
  },
})

export const { addMessage, clearMessages, clearChatError, clearMoodError } = chatSlice.actions

// ─── Selectors ────────────────────────────────────────────────────────────────
export const selectMessages      = (state) => state.chat.messages
export const selectChatLoading   = (state) => state.chat.isLoading
export const selectIsSending     = (state) => state.chat.isSending
export const selectChatError     = (state) => state.chat.error
export const selectMoodWeek      = (state) => state.chat.moodWeek
export const selectMoodMonthly   = (state) => state.chat.moodMonthly
export const selectMoodLoading   = (state) => state.chat.moodLoading
export const selectMoodError     = (state) => state.chat.moodError

export default chatSlice.reducer

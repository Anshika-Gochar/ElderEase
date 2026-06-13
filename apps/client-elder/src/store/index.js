import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import medReducer from './slices/medSlice'
import taskReducer from './slices/taskSlice'
import chatReducer from './slices/chatSlice'
import uiReducer from './slices/uiSlice'

/**
 * Root Redux store for ElderEase Elder Portal.
 * Combines auth, medications, tasks, chat, and UI state.
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    medications: medReducer,
    tasks: taskReducer,
    chat: chatReducer,
    ui: uiReducer,
  },
})

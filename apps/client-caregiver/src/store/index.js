import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice.js'
import elderReducer from './slices/elderSlice.js'
import alertReducer from './slices/alertSlice.js'
import dashboardReducer from './slices/dashboardSlice.js'

/**
 * Root Redux store for the ElderEase Caregiver Portal.
 * Combines auth, elder, alert, and dashboard slices.
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    elder: elderReducer,
    alerts: alertReducer,
    dashboard: dashboardReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore socket instance in state
        ignoredActions: ['socket/setSocket'],
        ignoredPaths: ['socket.instance'],
      },
    }),
})

/** @typedef {ReturnType<typeof store.getState>} RootState */
/** @typedef {typeof store.dispatch} AppDispatch */

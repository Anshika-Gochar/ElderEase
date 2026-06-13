import { createSlice } from '@reduxjs/toolkit'

/**
 * UI state slice — controls sidebar, toast notifications, and SOS mode.
 */
const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    sidebarCollapsed: false,
    activeNotifications: [],
    sosActive: false,
  },
  reducers: {
    /**
     * Toggle the sidebar between expanded and collapsed states.
     */
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    /**
     * Add a toast notification to the active list.
     * @param {object} action.payload - { id: string, type: 'info'|'success'|'warning'|'error', message: string }
     */
    addNotification(state, action) {
      state.activeNotifications.push(action.payload)
    },
    /**
     * Remove a notification by ID (called after auto-dismiss or manual close).
     * @param {object} action.payload - notification id string
     */
    removeNotification(state, action) {
      state.activeNotifications = state.activeNotifications.filter(
        (n) => n.id !== action.payload
      )
    },
    /**
     * Set the SOS active state. When true, the UI shows SOS confirmation UI.
     * @param {object} action.payload - boolean
     */
    setSosActive(state, action) {
      state.sosActive = action.payload
    },
  },
})

export const { toggleSidebar, addNotification, removeNotification, setSosActive } = uiSlice.actions

// ─── Selectors ───────────────────────────────────────────────────────────────
export const selectSidebarCollapsed = (state) => state.ui.sidebarCollapsed
export const selectNotifications = (state) => state.ui.activeNotifications
export const selectSosActive = (state) => state.ui.sosActive

export default uiSlice.reducer

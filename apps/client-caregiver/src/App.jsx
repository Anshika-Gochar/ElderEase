import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { fetchCurrentUser, selectIsAuthenticated, selectAuthLoading, selectUser, logout } from './store/slices/authSlice.js'

// Layout
import CaregiverLayout from './components/Layout/CaregiverLayout.jsx'

// Pages
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import EldersPage from './pages/EldersPage.jsx'
import AlertsPage from './pages/AlertsPage.jsx'
import MoodPage from './pages/MoodPage.jsx'
import MedicationTimelinePage from './pages/MedicationTimelinePage.jsx'
import TasksPage from './pages/TasksPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

/**
 * Route guard — redirects unauthenticated users to /login.
 * Also redirects users who do not have the 'caregiver' role.
 * @param {{ children: React.ReactNode }} props
 */
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated)
  const loading = useSelector(selectAuthLoading)
  const user = useSelector(selectUser)
  const dispatch = useDispatch()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#2BBD8E] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#718096] text-sm">Loading ElderEase…</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated && user && user.role !== 'caregiver') {
    dispatch(logout())
    return <Navigate to="/login" replace />
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

/**
 * Root application component.
 * Sets up React Router and restores auth session on mount.
 */
export default function App() {
  const dispatch = useDispatch()
  const isAuthenticated = useSelector(selectIsAuthenticated)

  useEffect(() => {
    // Attempt to restore session from stored token
    if (localStorage.getItem('token')) {
      dispatch(fetchCurrentUser())
    }
  }, [dispatch])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
        />

        {/* Protected routes under CaregiverLayout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <CaregiverLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="elders" element={<EldersPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="medications/:elderId" element={<MedicationTimelinePage />} />
          <Route path="mood/:elderId" element={<MoodPage />} />
          <Route path="tasks/:elderId" element={<TasksPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

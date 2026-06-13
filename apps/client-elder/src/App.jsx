import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { selectUser, clearAuth } from './store/slices/authSlice'
import AppLayout from './components/Layout/AppLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import MedicationsPage from './pages/MedicationsPage'
import TasksPage from './pages/TasksPage'
import ChatPage from './pages/ChatPage'
import ActivityLogPage from './pages/ActivityLogPage'
import MoodHistoryPage from './pages/MoodHistoryPage'
import ProfilePage from './pages/ProfilePage'
import ToastContainer from './components/common/ToastContainer'
import {
  requestNotificationPermission,
  registerFCMToken,
} from './utils/notifications.js'

// ─── Auth Guard ───────────────────────────────────────────────────────────────
// Restricts access to authenticated users with the role 'elder'.
function RequireAuth({ children }) {
  const token = localStorage.getItem('token')
  const user = useSelector(selectUser)
  const dispatch = useDispatch()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (user && user.role !== 'elder') {
    dispatch(clearAuth())
    return <Navigate to="/login" replace />
  }

  return children
}

// ─── FCM Initialiser ──────────────────────────────────────────────────────────
// Deferred push-notification registration (non-critical, swallows all errors).
function FCMInitialiser() {
  const token = localStorage.getItem('token')
  useEffect(() => {
    if (!token) return
    const t = setTimeout(async () => {
      try {
        const fcmToken = await requestNotificationPermission()
        if (fcmToken) await registerFCMToken(fcmToken)
      } catch (err) {
        console.warn('[FCM] init failed silently:', err?.message)
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [token])
  return null
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <ToastContainer />
      <FCMInitialiser />
      <Routes>

        {/* ── Public routes ── */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* ── Protected layout routes ── */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          {/* / → /home */}
          <Route index element={<Navigate to="/home" replace />} />
        </Route>

        <Route
          path="/home"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
        </Route>

        <Route
          path="/medications"
          element={<RequireAuth><AppLayout /></RequireAuth>}
        >
          <Route index element={<MedicationsPage />} />
        </Route>

        <Route
          path="/tasks"
          element={<RequireAuth><AppLayout /></RequireAuth>}
        >
          <Route index element={<TasksPage />} />
        </Route>

        <Route
          path="/chat"
          element={<RequireAuth><AppLayout /></RequireAuth>}
        >
          <Route index element={<ChatPage />} />
        </Route>

        <Route
          path="/activity"
          element={<RequireAuth><AppLayout /></RequireAuth>}
        >
          <Route index element={<ActivityLogPage />} />
        </Route>

        <Route
          path="/mood"
          element={<RequireAuth><AppLayout /></RequireAuth>}
        >
          <Route index element={<MoodHistoryPage />} />
        </Route>

        <Route
          path="/profile"
          element={<RequireAuth><AppLayout /></RequireAuth>}
        >
          <Route index element={<ProfilePage />} />
        </Route>

        {/* ── Fallback ── */}
        <Route path="*" element={<Navigate to="/home" replace />} />

      </Routes>
    </>
  )
}

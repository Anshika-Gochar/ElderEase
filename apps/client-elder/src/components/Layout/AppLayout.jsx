// apps/client-elder/src/components/Layout/AppLayout.jsx  MODIFIED
import React, { useEffect, useState, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { Bell, X, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import Sidebar from './Sidebar'
import { selectUser } from '../../store/slices/authSlice'
import { selectNotifications, removeNotification } from '../../store/slices/uiSlice'
import { connectSocket, disconnectSocket, getSocket } from '../../socket/socketClient'
import { fetchMedications, fetchTodayDoses } from '../../store/slices/medSlice'
import ReminderToast from '../ReminderToast'

// ─── Page Title Map ───────────────────────────────────────────────────────────
const PAGE_TITLES = {
  '/home':        'Dashboard',
  '/medications': 'My Medications',
  '/tasks':       'My Tasks',
  '/chat':        'Chat with Saathi',
  '/activity':    'Activity Log',
  '/mood':        'Mood History',
  '/profile':     'My Profile',
}

// ─── Notification Icon by type ────────────────────────────────────────────────
function NotifIcon({ type }) {
  if (type === 'error')   return <AlertTriangle size={14} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
  if (type === 'success') return <CheckCircle2  size={14} className="text-[#2BBD8E] flex-shrink-0 mt-0.5" />
  return                         <Info          size={14} className="text-[#4A9EE8] flex-shrink-0 mt-0.5" />
}

// ─── Notification Dropdown ────────────────────────────────────────────────────
function NotificationPanel({ notifications, onDismiss, onClose }) {
  if (notifications.length === 0) {
    return (
      <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl z-50 p-6 text-center">
        <Bell size={32} className="text-[#CBD5E0] mx-auto mb-2" />
        <p className="text-[14px] font-600 text-[#4A5568]">All caught up!</p>
        <p className="text-[13px] text-[#718096]">No notifications right now.</p>
      </div>
    )
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9]">
        <p className="text-[14px] font-700 text-[#1A202C]">
          Notifications <span className="ml-1 text-[12px] font-600 bg-[#EF4444] text-white px-1.5 py-0.5 rounded-full">{notifications.length}</span>
        </p>
        <button onClick={onClose} className="text-[#718096] hover:text-[#1A202C] transition-colors">
          <X size={16} />
        </button>
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y divide-[#F1F5F9]">
        {notifications.map((n) => (
          <li key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFC] transition-colors">
            <NotifIcon type={n.type} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-600 text-[#1A202C]">{n.title || n.message}</p>
              {n.title && n.message && (
                <p className="text-[12px] text-[#718096] mt-0.5 leading-snug">{n.message}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(n.id)}
              className="flex-shrink-0 p-0.5 text-[#A0AEC0] hover:text-[#EF4444] transition-colors"
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      {notifications.length > 0 && (
        <div className="px-4 py-2.5 border-t border-[#F1F5F9]">
          <button
            onClick={() => notifications.forEach((n) => onDismiss(n.id))}
            className="text-[12px] font-600 text-[#718096] hover:text-[#EF4444] transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

// ─── AppLayout ───────────────────────────────────────────────────────────────
export default function AppLayout() {
  const location      = useLocation()
  const navigate      = useNavigate()
  const dispatch      = useDispatch()
  const user          = useSelector(selectUser)
  const notifications = useSelector(selectNotifications)

  const [socket,        setSocket]        = useState(null)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const notifRef = useRef(null)

  const pageTitle = PAGE_TITLES[location.pathname] || 'ElderEase'
  const today     = format(new Date(), 'EEEE, MMMM d, yyyy')

  // Connect socket
  useEffect(() => {
    if (user?._id || user?.id) {
      const s = connectSocket(user._id || user.id)
      setSocket(s)
    }
    return () => { disconnectSocket(); setSocket(null) }
  }, [user?._id, user?.id])

  // Listen for medication changes to reload in real-time
  useEffect(() => {
    if (!socket) return

    const handleMedsChanged = () => {
      console.log('[Socket] Medications changed, reloading...')
      dispatch(fetchMedications())
      if (user?._id || user?.id) {
        dispatch(fetchTodayDoses(user._id || user.id))
      }
    }

    socket.on('medications:changed', handleMedsChanged)

    return () => {
      socket.off('medications:changed', handleMedsChanged)
    }
  }, [socket, dispatch, user])

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const getInitials = (name) => {
    if (!name) return 'U'
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="flex min-h-screen bg-[#F5F4F0]">
      <Sidebar />

      <div className="flex-1 ml-[260px] flex flex-col min-h-screen">
        {/* ── Top Header ── */}
        <header className="sticky top-0 z-30 bg-[#F5F4F0]/90 backdrop-blur-sm border-b border-[#E2E8F0] px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-700 text-[#1A202C] leading-tight">{pageTitle}</h1>
              <p className="text-[13px] text-[#718096] mt-0.5">{today}</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Notification Bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="relative w-10 h-10 bg-white rounded-full border border-[#E2E8F0] flex items-center justify-center hover:border-[#4A9EE8] transition-all shadow-sm"
                  aria-label="Notifications"
                >
                  <Bell size={18} className="text-[#718096]" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#EF4444] text-white text-[10px] font-700 rounded-full flex items-center justify-center">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <NotificationPanel
                    notifications={notifications}
                    onDismiss={(id) => dispatch(removeNotification(id))}
                    onClose={() => setNotifOpen(false)}
                  />
                )}
              </div>

              {/* Avatar → navigates to /profile */}
              <button
                onClick={() => navigate('/profile')}
                title="My Profile"
                className="w-10 h-10 rounded-full bg-[#2BBD8E] flex items-center justify-center text-white text-[14px] font-600 shadow-sm hover:ring-2 hover:ring-[#2BBD8E]/40 transition-all overflow-hidden"
              >
                {user?.avatarUrl || user?.profilePhoto ? (
                  <img
                    src={user.avatarUrl || user.profilePhoto}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getInitials(user?.name)
                )}
              </button>
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 px-8 py-6 animate-fade-in">
          <Outlet />
        </main>
      </div>

      <ReminderToast socket={socket} />
    </div>
  )
}

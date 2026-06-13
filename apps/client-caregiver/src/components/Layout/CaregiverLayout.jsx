import React, { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Bell, AlertTriangle, ChevronDown } from 'lucide-react'
import CaregiverSidebar from './CaregiverSidebar.jsx'
import { selectSelectedElder, fetchLinkedElders, selectElders } from '../../store/slices/elderSlice.js'
import { selectUser } from '../../store/slices/authSlice.js'
import { selectUnreadCount, fetchAlerts } from '../../store/slices/alertSlice.js'
import { connectSocket, disconnectSocket } from '../../socket/socketClient.js'

/**
 * Main layout wrapper for all protected caregiver pages.
 * Renders the sidebar, top navigation bar, and page content outlet.
 * Initialises Socket.io connection on mount.
 */
export default function CaregiverLayout() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const selectedElder = useSelector(selectSelectedElder)
  const elders = useSelector(selectElders)
  const unreadCount = useSelector(selectUnreadCount)

  // Fetch elders and alerts on mount
  useEffect(() => {
    dispatch(fetchLinkedElders())
    dispatch(fetchAlerts())
  }, [dispatch])

  // Connect socket once user + elders are available
  useEffect(() => {
    if (user?._id) {
      const elderIds = elders.map((e) => e._id)
      connectSocket(user._id, elderIds)
    }
    return () => {
      disconnectSocket()
    }
  }, [user?._id, elders])

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  return (
    <div className="flex min-h-screen bg-[#F5F4F0]">
      {/* ── Sidebar ── */}
      <CaregiverSidebar />

      {/* ── Main content area ── */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* ── Top bar ── */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {/* Elder name + status */}
          <div className="flex items-center gap-3">
            {selectedElder ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#2BBD8E] rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-[#718096]">Watching over</span>
                </div>
                <span className="text-sm font-bold text-[#1A202C]">{selectedElder.name}</span>
                {selectedElder.age != null && (
                  <span className="text-xs text-[#718096] bg-[#F5F4F0] px-2 py-0.5 rounded-full">
                    {selectedElder.age} years
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-[#718096]">No elder selected</span>
            )}
          </div>

          {/* Right side: SOS indicator + notifications */}
          <div className="flex items-center gap-3">
            {/* Alerts badge */}
            <button
              onClick={() => navigate('/alerts')}
              className="relative p-2 rounded-[8px] hover:bg-[#F5F4F0] transition-colors"
              title="View alerts"
            >
              <Bell className="w-5 h-5 text-[#718096]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-[#EF4444] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* User avatar */}
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => navigate('/settings')}>
              <div className="w-8 h-8 rounded-full bg-[#2BBD8E] flex items-center justify-center text-white text-xs font-bold">
                {user?.name
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || 'CG'}
              </div>
              <span className="text-sm font-medium text-[#1A202C] hidden md:block">{user?.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#718096] hidden md:block" />
            </div>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 p-6 page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

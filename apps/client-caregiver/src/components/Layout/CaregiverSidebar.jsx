import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  LayoutDashboard,
  Users,
  Bell,
  Settings,
  Heart,
  Pill,
  CheckSquare,
  LogOut,
  ChevronDown,
  ChevronUp,
  Activity,
  User,
} from 'lucide-react'
import { logout } from '../../store/slices/authSlice.js'
import { selectUser } from '../../store/slices/authSlice.js'
import { selectElders, selectSelectedElder, setSelectedElder } from '../../store/slices/elderSlice.js'
import { selectUnreadCount } from '../../store/slices/alertSlice.js'

/**
 * Caregiver sidebar navigation component.
 * Shows main navigation items and elder-specific sub-navigation
 * when an elder is selected. Includes elder selector dropdown.
 */
export default function CaregiverSidebar() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const elders = useSelector(selectElders)
  const selectedElder = useSelector(selectSelectedElder)
  const unreadCount = useSelector(selectUnreadCount)

  const [elderDropdownOpen, setElderDropdownOpen] = useState(false)

  /**
   * Handle elder selection from dropdown.
   * @param {object} elder - The selected elder object
   */
  const handleSelectElder = (elder) => {
    dispatch(setSelectedElder(elder))
    setElderDropdownOpen(false)
    navigate('/dashboard')
  }

  /**
   * Handle logout — clears Redux state and navigates to login.
   */
  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  /** Generate initials from a name string. */
  const getInitials = (name = '') =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-100 flex flex-col fixed left-0 top-0 z-30 overflow-y-auto">
      {/* ── Logo ── */}
      <div className="px-5 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#2BBD8E] rounded-[10px] flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" fill="white" />
          </div>
          <div>
            <h1 className="text-[#1A202C] font-bold text-base leading-none">ElderEase</h1>
            <p className="text-[#718096] text-xs mt-0.5">Caregiver Portal</p>
          </div>
        </div>
      </div>

      {/* ── Elder Selector ── */}
      {elders.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-[#718096] uppercase tracking-wider mb-2">
            Watching Over
          </p>
          <button
            onClick={() => setElderDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#F5F4F0] rounded-[8px] hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#4A9EE8] flex items-center justify-center text-white text-xs font-bold">
                {getInitials(selectedElder?.name || 'E')}
              </div>
              <span className="text-sm font-medium text-[#1A202C] truncate max-w-[110px]">
                {selectedElder?.name || 'Select Elder'}
              </span>
            </div>
            {elderDropdownOpen ? (
              <ChevronUp className="w-4 h-4 text-[#718096] flex-shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#718096] flex-shrink-0" />
            )}
          </button>

          {elderDropdownOpen && (
            <div className="mt-1 bg-white border border-gray-200 rounded-[8px] shadow-cardHover overflow-hidden">
              {elders.map((elder) => (
                <button
                  key={elder._id}
                  onClick={() => handleSelectElder(elder)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#EEF6FF] transition-colors text-left ${
                    selectedElder?._id === elder._id ? 'bg-[#EEF6FF]' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-[#4A9EE8] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(elder.name)}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-[#1A202C] truncate">{elder.name}</p>
                    <p className="text-xs text-[#718096] truncate">{elder.age} yrs</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {/* MAIN section */}
        <p className="text-xs font-semibold text-[#718096] uppercase tracking-wider px-2 mb-2">
          Main
        </p>

        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive ? 'nav-item-active flex items-center gap-3' : 'nav-item'
          }
        >
          <LayoutDashboard className="w-4.5 h-4.5 flex-shrink-0" />
          Dashboard
        </NavLink>

        <NavLink
          to="/elders"
          className={({ isActive }) =>
            isActive ? 'nav-item-active flex items-center gap-3' : 'nav-item'
          }
        >
          <Users className="w-4.5 h-4.5 flex-shrink-0" />
          My Elders
        </NavLink>

        <NavLink
          to="/alerts"
          className={({ isActive }) =>
            `${isActive ? 'nav-item-active' : 'nav-item'} flex items-center gap-3`
          }
        >
          <Bell className="w-4.5 h-4.5 flex-shrink-0" />
          Alerts
          {unreadCount > 0 && (
            <span className="ml-auto bg-[#EF4444] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive ? 'nav-item-active flex items-center gap-3' : 'nav-item'
          }
        >
          <Settings className="w-4.5 h-4.5 flex-shrink-0" />
          Settings
        </NavLink>

        {/* ELDER section — only shown when an elder is selected */}
        {selectedElder && (
          <>
            <div className="pt-4 pb-2">
              <p className="text-xs font-semibold text-[#718096] uppercase tracking-wider px-2">
                {selectedElder.name?.split(' ')[0] || 'Elder'}
              </p>
            </div>

            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive ? 'nav-item-active flex items-center gap-3' : 'nav-item'
              }
            >
              <Activity className="w-4.5 h-4.5 flex-shrink-0" />
              Overview
            </NavLink>

            <NavLink
              to={`/medications/${selectedElder._id}`}
              className={({ isActive }) =>
                isActive ? 'nav-item-active flex items-center gap-3' : 'nav-item'
              }
            >
              <Pill className="w-4.5 h-4.5 flex-shrink-0" />
              Medications
            </NavLink>

            <NavLink
              to={`/mood/${selectedElder._id}`}
              className={({ isActive }) =>
                isActive ? 'nav-item-active flex items-center gap-3' : 'nav-item'
              }
            >
              <Heart className="w-4.5 h-4.5 flex-shrink-0" />
              Mood & Wellbeing
            </NavLink>

            <NavLink
              to={`/tasks/${selectedElder._id}`}
              className={({ isActive }) =>
                isActive ? 'nav-item-active flex items-center gap-3' : 'nav-item'
              }
            >
              <CheckSquare className="w-4.5 h-4.5 flex-shrink-0" />
              Tasks
            </NavLink>
          </>
        )}
      </nav>

      {/* ── User footer ── */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#2BBD8E] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {user ? getInitials(user.name) : <User className="w-4 h-4" />}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold text-[#1A202C] truncate">{user?.name || 'Caregiver'}</p>
            <p className="text-xs text-[#718096] truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="text-[#718096] hover:text-[#EF4444] transition-colors p-1 rounded"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Home,
  Pill,
  CheckSquare,
  MessageCircle,
  Activity,
  TrendingUp,
  LogOut,
  Heart,
  User,
} from 'lucide-react'
import { logoutUser, selectUser } from '../../store/slices/authSlice'

// ─── Nav Config ───────────────────────────────────────────────────────────────

const MAIN_NAV = [
  { to: '/home',        icon: Home,          label: 'Home' },
  { to: '/medications', icon: Pill,          label: 'Medications' },
  { to: '/tasks',       icon: CheckSquare,   label: 'My Tasks' },
  { to: '/chat',        icon: MessageCircle, label: 'Chat with Saathi' },
]

const HEALTH_NAV = [
  { to: '/activity', icon: Activity,   label: 'Activity Log' },
  { to: '/mood',     icon: TrendingUp, label: 'Mood History' },
  { to: '/profile',  icon: User,       label: 'My Profile' },
]

// ─── NavItem ──────────────────────────────────────────────────────────────────

/**
 * A single sidebar navigation item with active state styling.
 * @param {{ to: string, icon: React.ElementType, label: string }} props
 */
function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg text-[15px] font-medium transition-all duration-150 group
        ${
          isActive
            ? 'bg-[#EEF6FF] text-[#1E6FD9] border-l-[3px] border-[#1E6FD9] pl-[13px]'
            : 'text-[#4A5568] hover:bg-gray-50 hover:text-[#1A202C]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={19}
            className={isActive ? 'text-[#1E6FD9]' : 'text-[#718096] group-hover:text-[#4A5568]'}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

/**
 * Fixed left sidebar for the elder portal.
 * Shows logo, navigation sections, and user info with logout.
 */
export default function Sidebar() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectUser)

  /** Generate initials from user name for avatar display */
  const getInitials = (name) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleLogout = async () => {
    await dispatch(logoutUser())
    navigate('/login', { replace: true })
  }

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-[260px] bg-white border-r border-[#E2E8F0] flex flex-col z-40"
      aria-label="Main navigation"
    >
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#E2E8F0]">
        <div className="w-9 h-9 bg-[#2BBD8E] rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
          <Heart size={18} className="text-white" fill="white" />
        </div>
        <div>
          <span className="text-[17px] font-700 text-[#1A202C] tracking-tight">
            Elder<span className="text-[#2BBD8E]">Ease</span>
          </span>
          <p className="text-[11px] text-[#718096] leading-tight">Health Companion</p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Main section */}
        <div>
          <p className="text-[11px] font-600 text-[#A0AEC0] uppercase tracking-widest px-4 mb-2">
            Main
          </p>
          <ul className="space-y-1">
            {MAIN_NAV.map((item) => (
              <li key={item.to}>
                <NavItem {...item} />
              </li>
            ))}
          </ul>
        </div>

        {/* Health section */}
        <div>
          <p className="text-[11px] font-600 text-[#A0AEC0] uppercase tracking-widest px-4 mb-2">
            Health
          </p>
          <ul className="space-y-1">
            {HEALTH_NAV.map((item) => (
              <li key={item.to}>
                <NavItem {...item} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* ── User Profile + Logout ── */}
      <div className="border-t border-[#E2E8F0] px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-[#2BBD8E] flex items-center justify-center text-white text-[13px] font-600 flex-shrink-0">
            {getInitials(user?.name)}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-600 text-[#1A202C] truncate">
              {user?.name || 'Elder User'}
            </p>
            <p className="text-[12px] text-[#718096] truncate">{user?.email || ''}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-[#718096] hover:text-[#EF4444] hover:bg-red-50 rounded-lg transition-all duration-150"
          aria-label="Sign out"
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}

import React from 'react'
import { Smile, Pill, CheckSquare, Bell } from 'lucide-react'

/**
 * Skeleton loader for a single stat card.
 */
const StatSkeleton = () => (
  <div className="card flex-1 min-w-[180px]">
    <div className="skeleton h-4 w-24 mb-4 rounded" />
    <div className="skeleton h-8 w-16 mb-2 rounded" />
    <div className="skeleton h-3 w-32 rounded" />
  </div>
)

/**
 * Individual stat card component.
 * @param {{ icon: React.ReactNode, label: string, value: string|number, sub: string, color: string, bgColor: string }} props
 */
const StatCard = ({ icon, label, value, sub, color, bgColor }) => (
  <div className="card flex-1 min-w-[180px] flex items-start gap-4">
    <div
      className="w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: bgColor }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-[#718096] uppercase tracking-wider truncate">{label}</p>
      <p className="text-2xl font-bold mt-0.5" style={{ color }}>
        {value ?? '—'}
      </p>
      <p className="text-xs text-[#718096] mt-0.5 truncate">{sub}</p>
    </div>
  </div>
)

/**
 * StatsRow — 4 summary stat cards for the caregiver dashboard.
 *
 * @param {{
 *   moodAvg: number|null,
 *   adherencePct: number|null,
 *   tasksCompleted: number|null,
 *   activeAlerts: number|null,
 *   loading: boolean
 * }} props
 */
export default function StatsRow({
  moodAvg = null,
  adherencePct = null,
  tasksCompleted = null,
  activeAlerts = null,
  loading = false,
}) {
  if (loading) {
    return (
      <div className="flex gap-4 flex-wrap">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
    )
  }

  /**
   * Returns an emoji representing the mood score.
   * @param {number|null} score
   */
  const getMoodEmoji = (score) => {
    if (score === null) return '😶'
    if (score >= 8) return '😄'
    if (score >= 6) return '🙂'
    if (score >= 4) return '😐'
    if (score >= 2) return '😟'
    return '😢'
  }

  const moodDisplay = moodAvg !== null ? `${moodAvg.toFixed(1)}/10` : '—'
  const adherenceDisplay = adherencePct !== null ? `${Math.round(adherencePct)}%` : '—'
  const alertsColor = activeAlerts > 0 ? '#EF4444' : '#2BBD8E'
  const alertsBg = activeAlerts > 0 ? '#FEF2F2' : '#ECFDF5'

  return (
    <div className="flex gap-4 flex-wrap">
      {/* Mood */}
      <StatCard
        icon={
          <span className="text-xl leading-none">
            {getMoodEmoji(moodAvg)}
          </span>
        }
        label="Mood (7-day avg)"
        value={moodDisplay}
        sub={moodAvg !== null ? (moodAvg >= 6 ? 'Feeling good' : moodAvg >= 4 ? 'Neutral' : 'Needs attention') : 'No data'}
        color="#4A9EE8"
        bgColor="#EFF6FF"
      />

      {/* Med Adherence */}
      <StatCard
        icon={<Pill className="w-5 h-5 text-[#2BBD8E]" />}
        label="Med Adherence"
        value={adherenceDisplay}
        sub={adherencePct !== null ? (adherencePct >= 80 ? 'On track' : 'Needs improvement') : 'No data'}
        color="#2BBD8E"
        bgColor="#ECFDF5"
      />

      {/* Tasks today */}
      <StatCard
        icon={<CheckSquare className="w-5 h-5 text-[#F5A623]" />}
        label="Tasks Today"
        value={tasksCompleted !== null ? String(tasksCompleted) : '—'}
        sub="Completed tasks"
        color="#F5A623"
        bgColor="#FFFBEB"
      />

      {/* Active alerts */}
      <StatCard
        icon={<Bell className="w-5 h-5" style={{ color: alertsColor }} />}
        label="Active Alerts"
        value={activeAlerts !== null ? String(activeAlerts) : '—'}
        sub={activeAlerts > 0 ? 'Requires attention' : 'All clear'}
        color={alertsColor}
        bgColor={alertsBg}
      />
    </div>
  )
}

import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { format } from 'date-fns'
import { Users } from 'lucide-react'

// Store
import {
  selectSelectedElder,
  selectDashboardData,
  selectDashboardLoading,
  fetchElderDashboard,
} from '../store/slices/elderSlice.js'
import { selectAlerts, fetchAlerts, selectAnomalyFlags, fetchSosHistory } from '../store/slices/alertSlice.js'
import { selectRealtimeFeed, seedRealtimeFeed } from '../store/slices/dashboardSlice.js'

// Components
import StatsRow from '../components/dashboard/StatsRow.jsx'
import MoodChart from '../components/dashboard/MoodChart.jsx'
import AdherenceChart from '../components/dashboard/AdherenceChart.jsx'
import AlertPanel from '../components/dashboard/AlertPanel.jsx'
import AIDigestPanel from '../components/dashboard/AIDigestPanel.jsx'
import SOSButton from '../components/dashboard/SOSButton.jsx'
import AnomalyPanel from '../components/dashboard/AnomalyPanel.jsx'

/**
 * Real-time feed item component.
 * @param {{ event: object }} props
 */
const FeedItem = ({ event }) => {
  const colors = {
    sos: 'text-[#EF4444] bg-red-50',
    anomaly: 'text-[#F5A623] bg-amber-50',
    missed_meds: 'text-[#4A9EE8] bg-blue-50',
    task_completed: 'text-[#2BBD8E] bg-green-50',
    low_mood: 'text-[#718096] bg-gray-50',
  }
  const cls = colors[event.type] || 'text-[#718096] bg-gray-50'
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-[8px] ${cls}`}>
      <p className="text-xs font-medium flex-1">{event.label}</p>
      {event.elderName && (
        <span className="text-[11px] opacity-70 flex-shrink-0">{event.elderName}</span>
      )}
      <span className="text-[11px] opacity-60 flex-shrink-0">
        {event.timestamp ? format(new Date(event.timestamp), 'h:mm a') : ''}
      </span>
    </div>
  )
}

/**
 * DashboardPage — Main caregiver dashboard.
 * Shows stat cards, mood/adherence charts, alerts, AI digest, and real-time feed.
 */
export default function DashboardPage() {
  const dispatch = useDispatch()
  const selectedElder = useSelector(selectSelectedElder)
  const dashboardData = useSelector(selectDashboardData)
  const loading = useSelector(selectDashboardLoading)
  const alerts = useSelector(selectAlerts)
  const realtimeFeed    = useSelector(selectRealtimeFeed)
  const anomalyFlags    = useSelector(selectAnomalyFlags)

  // Fetch dashboard data when selected elder changes
  useEffect(() => {
    if (selectedElder?._id) {
      dispatch(fetchElderDashboard(selectedElder._id))
    }
  }, [dispatch, selectedElder?._id])

  // Refresh alerts and SOS history
  useEffect(() => {
    dispatch(fetchAlerts())
    dispatch(fetchSosHistory())
  }, [dispatch])

  // Seed the live feed from historical data whenever dashboard / alerts load.
  // This prevents the feed from permanently showing "Waiting for real-time
  // events…" after a page refresh when no new socket events have fired yet.
  useEffect(() => {
    if (!selectedElder) return

    const historical = []

    // Recent alerts (SOS, anomaly, missed dose) — newest first
    const elderAlertsFull = alerts.filter(
      (a) => (a.elderId?._id || a.elderId) === selectedElder._id
    )
    elderAlertsFull.slice(0, 5).forEach((a) => {
      const typeMap = {
        sos:        { key: 'sos',        icon: '🚨', label: 'SOS Alert triggered' },
        missed_dose:{ key: 'missed_meds',icon: '⚠️', label: `Missed: ${a.medicationName || 'medication'}` },
        low_mood:   { key: 'low_mood',   icon: '😞', label: `Low mood detected` },
        anomaly:    { key: 'anomaly',    icon: '⚠️', label: a.message || 'Anomaly detected' },
      }
      const t = typeMap[a.type] || { key: 'alert', icon: 'ℹ️', label: a.message || a.type }
      historical.push({
        type:      t.key,
        label:     `${t.icon} ${t.label}`,
        elderName: selectedElder.name,
        timestamp: a.createdAt || a.receivedAt || new Date().toISOString(),
      })
    })

    // Unresolved anomaly flags
    anomalyFlags.slice(0, 3).forEach((f) => {
      historical.push({
        type:      'anomaly',
        label:     `⚠️ Anomaly: ${f.message || f.type || 'Unusual behaviour detected'}`,
        elderName: selectedElder.name,
        timestamp: f.createdAt || new Date().toISOString(),
      })
    })

    // Recent task completions from dashboard
    const completedTasks = (dashboardData?.tasks || []).filter((t) => t.completedToday)
    completedTasks.slice(0, 3).forEach((t) => {
      historical.push({
        type:      'task_completed',
        label:     `✅ Task completed: ${t.title || 'Task'}`,
        elderName: selectedElder.name,
        timestamp: new Date().toISOString(),
      })
    })

    // Today's mood score if available
    const moodScores = dashboardData?.moodScores || []
    const latestMood = moodScores[moodScores.length - 1]
    if (latestMood) {
      const scoreLabel =
        latestMood.score >= 7 ? '😊 Good'
        : latestMood.score >= 4 ? '😐 Neutral'
        : '😔 Low'
      historical.push({
        type:      'mood_update',
        label:     `💚 Mood updated: ${Number(latestMood.score).toFixed(1)}/10 (${scoreLabel})`,
        elderName: selectedElder.name,
        timestamp: latestMood.updatedAt || latestMood.date || new Date().toISOString(),
      })
    }

    if (historical.length > 0) {
      // Sort by timestamp descending (newest first) then seed
      historical.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      dispatch(seedRealtimeFeed(historical))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElder?._id, dashboardData, alerts.length, anomalyFlags.length])

  // ── No elder selected empty state ──
  if (!selectedElder) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-20 h-20 bg-white rounded-full shadow-card flex items-center justify-center mb-4">
          <Users className="w-10 h-10 text-[#718096]" />
        </div>
        <h2 className="text-xl font-bold text-[#1A202C] mb-2">No Elder Selected</h2>
        <p className="text-sm text-[#718096] max-w-xs">
          Select an elder from the sidebar dropdown to view their live dashboard.
        </p>
      </div>
    )
  }

  // ── Extract dashboard data ──
  const moodTrend = dashboardData?.moodScores || []
  const moodAvg = moodTrend.length > 0
    ? Number((moodTrend.reduce((sum, s) => sum + s.score, 0) / moodTrend.length).toFixed(1))
    : null
  const adherencePct = dashboardData?.medicationAdherence?.adherencePercent ?? null
  const tasks = dashboardData?.tasks || []
  const tasksCompleted = tasks.length > 0
    ? tasks.filter((t) => t.completedToday).length
    : null

  // Filter alerts for the selected elder
  const elderAlerts = alerts.filter(
    (a) => (a.elderId?._id || a.elderId) === selectedElder._id
  )

  const activeAlerts = (
    elderAlerts.filter((a) => !a.read && !a.resolved).length +
    anomalyFlags.filter((f) => f.resolvedAt == null).length
  )

  return (
    <div className="space-y-5 page-enter">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A202C]">
            Dashboard — Watching over {selectedElder.name}
          </h1>
          <p className="text-sm text-[#718096] mt-0.5">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium text-[#2BBD8E] bg-[#ECFDF5] px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 bg-[#2BBD8E] rounded-full animate-pulse" />
          Live monitoring active
        </span>
      </div>

      {/* ── Stat cards ── */}
      <StatsRow
        moodAvg={moodAvg}
        adherencePct={adherencePct}
        tasksCompleted={tasksCompleted}
        activeAlerts={activeAlerts}
        loading={loading}
      />

      {/* ── Charts + Panels (2-col grid) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Left column */}
        <div className="flex flex-col gap-0">
          <MoodChart data={moodTrend} loading={loading} />
          <AdherenceChart elderId={selectedElder._id} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-0">
          <AlertPanel
            alerts={elderAlerts.slice(0, 8)}
            loading={loading}
            elderId={selectedElder._id}
          />
          <AnomalyPanel elderId={selectedElder._id} />
          <AIDigestPanel elderId={selectedElder._id} />
        </div>
      </div>

      {/* ── SOS History ── */}
      <div className="pt-3">
        <SOSButton elderId={selectedElder._id} />
      </div>

      {/* ── Real-time activity feed ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#1A202C]">Live Activity Feed</h3>
          <span className="flex items-center gap-1.5 text-[11px] text-[#2BBD8E] font-medium">
            <span className="w-1.5 h-1.5 bg-[#2BBD8E] rounded-full animate-pulse" />
            Real-time
          </span>
        </div>

        {realtimeFeed.length === 0 ? (
          <div className="text-center py-6 text-[#718096] text-sm">
            Waiting for real-time events… Activity will appear here live.
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {realtimeFeed.map((event, i) => (
              <FeedItem key={i} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

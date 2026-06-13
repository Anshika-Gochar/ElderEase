/**
 * apps/client-caregiver/src/pages/MoodPage.jsx  MODIFY
 *
 * Caregiver mood analysis page for a selected elder.
 * Phase 4 additions:
 *  - 7d / 30d period toggle
 *  - Monthly data from GET /api/ai/mood/:elderId/monthly
 *  - Refresh button
 *  - Trend stat cards (avg / best / worst)
 *  - Sentiment breakdown bars
 *  - Live socket update (mood:updated) for today's score
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { TrendingUp, SmilePlus, Frown, RefreshCw, Calendar } from 'lucide-react'

import axiosInstance from '../api/axiosConfig.js'
import { getSocket } from '../socket/socketClient.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateToDayAbbr(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return DAY_ABBR[d.getDay()]
  } catch {
    return dateStr
  }
}

function dateToShort(dateStr) {
  try { return format(parseISO(dateStr), 'MMM d') } catch { return dateStr }
}

function sentimentLabel(score) {
  if (score >= 7) return 'positive'
  if (score >= 4) return 'neutral'
  return 'negative'
}

function getMoodEmoji(score) {
  if (score >= 8) return '😄'
  if (score >= 6) return '🙂'
  if (score >= 4) return '😐'
  if (score >= 2) return '😟'
  return '😢'
}

function getScoreColor(score) {
  if (score >= 7) return '#2BBD8E'
  if (score >= 4) return '#F5A623'
  return '#EF4444'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Recharts custom tooltip */
const MoodTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  const score = d?.score ?? 0
  return (
    <div className="bg-white border border-gray-200 rounded-[10px] px-3 py-2.5 shadow-md text-sm min-w-[120px]">
      <p className="font-semibold text-[#1A202C] mb-0.5">{d?.fullDate || d?.dateLabel}</p>
      <p className="font-bold" style={{ color: getScoreColor(score) }}>
        {getMoodEmoji(score)} {score?.toFixed(1)}/10
      </p>
      {d?.sentimentLabel && (
        <p className="text-[11px] capitalize mt-0.5 text-[#718096]">{d.sentimentLabel}</p>
      )}
    </div>
  )
}

/** Stat card */
function StatCard({ icon: Icon, value, sub, iconColor, bg, border }) {
  return (
    <div className="rounded-xl border p-4 flex items-center gap-3" style={{ backgroundColor: bg, borderColor: border }}>
      <Icon size={20} style={{ color: iconColor }} className="flex-shrink-0" />
      <div>
        <p className="text-[22px] font-bold leading-none" style={{ color: iconColor }}>{value}</p>
        <p className="text-[12px] text-[#718096] mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

/** Sentiment progress bar */
function SentimentBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-[12px] text-[#4A5568] font-500 capitalize">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-600 text-[#718096] w-10 text-right">
        {count} day{count !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

/** Distribution boxes (positive / neutral / low day counts) */
function DistributionBoxes({ data }) {
  const positive = data.filter((d) => d.score >= 7).length
  const neutral  = data.filter((d) => d.score >= 4 && d.score < 7).length
  const negative = data.filter((d) => d.score < 4).length

  const boxes = [
    { label: 'Positive', count: positive, color: '#2BBD8E', bg: '#F0FDF4', border: '#BBF7D0', emoji: '😊' },
    { label: 'Neutral',  count: neutral,  color: '#F5A623', bg: '#FFFBEB', border: '#FDE68A', emoji: '😐' },
    { label: 'Low',      count: negative, color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', emoji: '😟' },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 mt-3">
      {boxes.map(({ label, count, color, bg, border, emoji }) => (
        <div key={label} className="rounded-[10px] border p-3 text-center" style={{ backgroundColor: bg, borderColor: border }}>
          <div className="text-xl mb-1">{emoji}</div>
          <div className="text-2xl font-bold" style={{ color }}>{count}</div>
          <div className="text-[11px] text-[#718096] mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

/** Skeleton loading */
function MoodSkeleton() {
  return (
    <div className="space-y-5 page-enter animate-pulse">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
      </div>
      <div className="card skeleton h-64 w-full" />
      <div className="skeleton h-24 w-full rounded-[10px]" />
    </div>
  )
}

// ─── MoodPage ─────────────────────────────────────────────────────────────────

/**
 * Full mood analysis page with 7-day / 30-day toggle, trend stat cards,
 * sentiment breakdown, and live socket updates for the selected elder.
 */
export default function MoodPage() {
  const { elderId } = useParams()

  const [period, setPeriod]       = useState('7d')    // '7d' | '30d'
  const [chartData, setChartData] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  // ── Fetch mood data (either 7-day or 30-day) ────────────────────────────────
  const fetchMood = useCallback(async (activePeriod = period) => {
    if (!elderId) return
    setLoading(true)
    setError(null)
    try {
      const url = activePeriod === '30d'
        ? `/ai/mood/${elderId}/monthly`
        : `/ai/mood/${elderId}`

      const { data } = await axiosInstance.get(url)

      // Both endpoints return { scores: [...] }
      const arr = Array.isArray(data?.scores)
        ? data.scores
        : (Array.isArray(data) ? data : [])

      setChartData(
        arr.map((d, idx) => ({
          ...d,
          sentimentLabel: d.sentimentLabel || sentimentLabel(d.score),
          dateLabel: activePeriod === '7d'
            ? dateToDayAbbr(d.date)
            : (idx % 5 === 0 ? dateToShort(d.date) : ''),   // sparse 30d labels
          fullDate: dateToShort(d.date),
        }))
      )
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load mood data')
    } finally {
      setLoading(false)
    }
  }, [elderId, period])

  useEffect(() => {
    fetchMood(period)
  }, [elderId, period]) // re-fetch when period or elder changes

  // ── Live update via socket (mood:updated) ────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const handler = (payload) => {
      if (payload.elderId !== elderId) return
      const today = new Date().toISOString().slice(0, 10)

      setChartData((prev) => {
        const existingIdx = prev.findIndex((d) => d.date === today)
        const updated = {
          date:           today,
          dateLabel:      dateToDayAbbr(today),
          fullDate:       dateToShort(today),
          score:          payload.moodScore,
          sentimentLabel: sentimentLabel(payload.moodScore),
        }
        if (existingIdx !== -1) {
          const next = [...prev]
          next[existingIdx] = updated
          return next
        }
        return [...prev.slice(-30), updated]  // keep last 30 days at most
      })
    }

    socket.on('mood:updated', handler)
    return () => socket.off('mood:updated', handler)
  }, [elderId])

  // ── Computed trend stats ─────────────────────────────────────────────────────
  const { avgScore, bestDay, worstDay, positive, neutral, negative } = useMemo(() => {
    if (!chartData.length) {
      return { avgScore: null, bestDay: null, worstDay: null, positive: 0, neutral: 0, negative: 0 }
    }
    const scores = chartData.map((d) => d.score)
    const avg    = scores.reduce((a, b) => a + b, 0) / scores.length
    const maxVal = Math.max(...scores)
    const minVal = Math.min(...scores)

    return {
      avgScore: avg,
      bestDay:  chartData.find((d) => d.score === maxVal),
      worstDay: chartData.find((d) => d.score === minVal),
      positive: chartData.filter((d) => d.sentimentLabel === 'positive').length,
      neutral:  chartData.filter((d) => d.sentimentLabel === 'neutral').length,
      negative: chartData.filter((d) => d.sentimentLabel === 'negative').length,
    }
  }, [chartData])

  const latestScore = chartData[chartData.length - 1]?.score ?? null
  const latestLabel = latestScore != null
    ? (latestScore >= 7 ? `Good ${getMoodEmoji(latestScore)}` : latestScore >= 4 ? `Neutral ${getMoodEmoji(latestScore)}` : `Low ${getMoodEmoji(latestScore)}`)
    : null
  const latestColor = latestScore != null ? getScoreColor(latestScore) : '#718096'

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return <MoodSkeleton />

  if (error) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <span className="text-3xl mb-3">⚠️</span>
        <p className="text-sm font-medium text-[#1A202C]">{error}</p>
        <button
          id="mood-retry"
          onClick={() => fetchMood(period)}
          className="mt-4 text-sm text-[#4A9EE8] hover:underline font-medium"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 page-enter">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A202C]">Mood &amp; Wellbeing</h1>
          <p className="text-sm text-[#718096] mt-0.5">
            {period === '7d' ? '7-day' : '30-day'} trend · auto-updated from Saathi chats
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period toggle */}
          <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-xl">
            {['7d', '30d'].map((p) => (
              <button
                key={p}
                id={`mood-period-${p}`}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-600 transition-all duration-200 ${
                  period === p
                    ? 'bg-white shadow text-[#1A202C]'
                    : 'text-[#718096] hover:text-[#1A202C]'
                }`}
              >
                {p === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            id="mood-refresh"
            onClick={() => fetchMood(period)}
            title="Refresh mood data"
            className="p-2 rounded-lg bg-white shadow-sm border border-[#E2E8F0]
                       hover:border-[#4A9EE8] text-[#718096] hover:text-[#4A9EE8]
                       transition-colors duration-200"
          >
            <RefreshCw size={14} />
          </button>

          {/* Today's mood badge */}
          {latestLabel && (
            <div
              className="px-3 py-1.5 rounded-full text-sm font-semibold border"
              style={{ color: latestColor, borderColor: latestColor, backgroundColor: `${latestColor}18` }}
            >
              Today: {latestLabel}
            </div>
          )}
        </div>
      </div>

      {/* ── No data state ── */}
      {chartData.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Calendar size={40} className="text-[#CBD5E0] mb-4" />
          <p className="text-[15px] font-semibold text-[#1A202C] mb-2">No mood data yet</p>
          <p className="text-sm text-[#718096] max-w-xs leading-relaxed">
            Mood is tracked automatically from Saathi conversations. Once this elder chats with
            Saathi, scores will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* ── Trend Stat Cards ── */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={TrendingUp}
              value={avgScore?.toFixed(1) ?? '--'}
              sub={`${period === '7d' ? '7' : '30'}-day average`}
              iconColor="#4A9EE8"
              bg="#EFF6FF"
              border="#BFDBFE"
            />
            <StatCard
              icon={SmilePlus}
              value={bestDay ? `${bestDay.score.toFixed(1)}` : '--'}
              sub={bestDay ? `Best: ${bestDay.fullDate}` : 'Best day'}
              iconColor="#2BBD8E"
              bg="#F0FDF9"
              border="#A7F3D0"
            />
            <StatCard
              icon={Frown}
              value={worstDay ? `${worstDay.score.toFixed(1)}` : '--'}
              sub={worstDay ? `Lowest: ${worstDay.fullDate}` : 'Lowest day'}
              iconColor="#F5A623"
              bg="#FFFBEB"
              border="#FDE68A"
            />
          </div>

          {/* ── Area Chart ── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#1A202C]">
                {period === '7d' ? '7-Day' : '30-Day'} Mood Trend
              </h3>
              <span className="text-xs text-[#718096]">
                Avg: {avgScore?.toFixed(1)}/10 &nbsp;·&nbsp; {chartData.length} data point{chartData.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="moodGradCG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4A9EE8" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#4A9EE8" stopOpacity={0.0}  />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11, fill: '#718096' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  domain={[0, 10]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  tick={{ fontSize: 10, fill: '#718096' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<MoodTooltip />} />
                <ReferenceLine
                  y={3}
                  stroke="#EF4444"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: 'Low', position: 'insideLeft', fill: '#EF4444', fontSize: 10 }}
                />
                <ReferenceLine
                  y={7}
                  stroke="#2BBD8E"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: 'Good', position: 'insideLeft', fill: '#2BBD8E', fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#4A9EE8"
                  strokeWidth={2.5}
                  fill="url(#moodGradCG)"
                  dot={{ r: period === '30d' ? 2 : 4, fill: '#4A9EE8', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#4A9EE8', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Sentiment Breakdown ── */}
          <div className="card">
            <h3 className="text-sm font-semibold text-[#1A202C] mb-1">
              {period === '7d' ? '7-Day' : '30-Day'} Summary
            </h3>
            <p className="text-xs text-[#718096] mb-4">
              Positive ≥ 7 &nbsp;·&nbsp; Neutral 4–6 &nbsp;·&nbsp; Low &lt; 4
            </p>

            {/* Distribution boxes */}
            <DistributionBoxes data={chartData} />

            {/* Sentiment progress bars */}
            <div className="mt-4 space-y-2.5">
              <SentimentBar label="Positive" count={positive} total={chartData.length} color="#2BBD8E" />
              <SentimentBar label="Neutral"  count={neutral}  total={chartData.length} color="#F5A623" />
              <SentimentBar label="Low"      count={negative} total={chartData.length} color="#EF4444" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

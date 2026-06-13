// apps/client-elder/src/pages/MoodHistoryPage.jsx  MODIFY
import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
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
import { TrendingUp, SmilePlus, Meh, Frown, Calendar, BarChart2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'

import { selectUser } from '../store/slices/authSlice'
import {
  fetchMood7Day,
  fetchMoodMonthly,
  selectMoodWeek,
  selectMoodMonthly,
  selectMoodLoading,
} from '../store/slices/chatSlice'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSentimentColor(label) {
  if (label === 'positive') return '#2BBD8E'
  if (label === 'negative') return '#EF4444'
  return '#F5A623'
}

function getMoodEmoji(score) {
  if (score >= 8) return { emoji: '😄', label: 'Great', color: '#2BBD8E' }
  if (score >= 6) return { emoji: '😊', label: 'Good',  color: '#4A9EE8' }
  if (score >= 4) return { emoji: '😐', label: 'Okay',  color: '#F5A623' }
  return         { emoji: '😔', label: 'Low',   color: '#EF4444' }
}

function sentimentLabel(score) {
  if (score >= 7) return 'positive'
  if (score >= 4) return 'neutral'
  return 'negative'
}

/** Format a YYYY-MM-DD string for X-axis display */
function formatXAxis(dateStr, period) {
  try {
    const d = parseISO(dateStr)
    return period === '7d' ? format(d, 'EEE') : format(d, 'MMM d')
  } catch {
    return dateStr
  }
}

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  const { emoji } = getMoodEmoji(item.score)
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-700 text-[#1A202C] mb-0.5">
        {item.fullDate} {emoji}
      </p>
      <p className="text-[#718096]">
        Score:{' '}
        <span className="font-700 text-[#4A9EE8]">{item.score?.toFixed(1)}/10</span>
      </p>
      {item.sentimentLabel && (
        <p className="capitalize mt-0.5" style={{ color: getSentimentColor(item.sentimentLabel) }}>
          {item.sentimentLabel}
        </p>
      )}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, iconColor, bgClass, borderClass }) {
  return (
    <div className={`card p-5 ${bgClass} border ${borderClass}`}>
      <div className="flex items-center gap-3">
        <Icon size={22} style={{ color: iconColor }} />
        <div>
          <p className="text-[26px] font-700 leading-none" style={{ color: iconColor }}>
            {value}
          </p>
          <p className="text-[13px] text-[#4A5568] font-500 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Sentiment Bar ────────────────────────────────────────────────────────────

function SentimentBar({ label, count, total, color, bg }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-[13px] font-500 text-[#4A5568] capitalize">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-[#F1F5F9] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-12 text-right text-[12px] font-600 text-[#4A5568]">
        {count} day{count !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

// ─── Skeleton Loading ─────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return (
    <div className={`animate-pulse bg-[#E2E8F0] rounded-lg ${className}`} />
  )
}

// ─── MoodHistoryPage ──────────────────────────────────────────────────────────

/**
 * Mood history page with 7-day / 30-day toggle, trend summary stat cards,
 * and sentiment breakdown bars. Fetches real data from the backend API.
 */
export default function MoodHistoryPage() {
  const dispatch = useDispatch()
  const user       = useSelector(selectUser)
  const moodWeek   = useSelector(selectMoodWeek)
  const moodMonth  = useSelector(selectMoodMonthly)
  const loading    = useSelector(selectMoodLoading)

  const [period, setPeriod] = useState('7d')   // '7d' | '30d'

  const elderId = user?._id || user?.id

  // Fetch on mount + when period changes
  useEffect(() => {
    if (!elderId) return
    if (period === '7d') {
      dispatch(fetchMood7Day(elderId))
    } else {
      dispatch(fetchMoodMonthly(elderId))
    }
  }, [dispatch, elderId, period])

  // Raw scores array for the selected period
  const rawScores = period === '7d' ? moodWeek : moodMonth

  // Enrich for Recharts — add computed fields
  const chartData = useMemo(() => {
    if (!rawScores.length) return []

    // For 30-day: show every 5th label on X-axis to avoid crowding
    return rawScores.map((s, idx) => ({
      ...s,
      dateLabel:     formatXAxis(s.date, period),
      fullDate:      (() => { try { return format(parseISO(s.date), 'MMM d') } catch { return s.date } })(),
      sentimentLabel: s.sentimentLabel || sentimentLabel(s.score),
      // For 30-day: blank label on non-5th ticks
      xLabel: period === '30d'
        ? (idx % 5 === 0 ? formatXAxis(s.date, period) : '')
        : formatXAxis(s.date, period),
    }))
  }, [rawScores, period])

  // ── Trend summary computations ──────────────────────────────────────────────
  const { avg, bestDay, lowestDay, positive, neutral, negative } = useMemo(() => {
    if (!chartData.length) {
      return { avg: '--', bestDay: null, lowestDay: null, positive: 0, neutral: 0, negative: 0 }
    }
    const scores = chartData.map((d) => d.score)
    const avgVal = scores.reduce((a, b) => a + b, 0) / scores.length

    const bestIdx   = scores.indexOf(Math.max(...scores))
    const lowestIdx = scores.indexOf(Math.min(...scores))

    const pos = chartData.filter((d) => d.sentimentLabel === 'positive').length
    const neg = chartData.filter((d) => d.sentimentLabel === 'negative').length
    const neu = chartData.length - pos - neg

    return {
      avg:      avgVal.toFixed(1),
      bestDay:  chartData[bestIdx],
      lowestDay: chartData[lowestIdx],
      positive: pos,
      neutral:  neu,
      negative: neg,
    }
  }, [chartData])

  const total = chartData.length

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header + Period Toggle ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-700 text-[#1A202C]">Mood History</h2>
          <p className="text-[13px] text-[#718096] mt-0.5">
            {period === '7d' ? 'Last 7 days' : 'Last 30 days'} of your mood with Saathi
          </p>
        </div>
        {/* 7d / 30d pill toggle */}
        <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-xl">
          {['7d', '30d'].map((p) => (
            <button
              key={p}
              id={`mood-period-${p}`}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-[13px] font-600 transition-all duration-200 ${
                period === p
                  ? 'bg-white shadow text-[#1A202C]'
                  : 'text-[#718096] hover:text-[#1A202C]'
              }`}
            >
              {p === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Trend Summary Stat Cards ── */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={TrendingUp}
            value={avg}
            label={`${period === '7d' ? '7' : '30'}-day average`}
            iconColor="#4A9EE8"
            bgClass="bg-[#EFF6FF]"
            borderClass="border-[#BFDBFE]"
          />
          <StatCard
            icon={SmilePlus}
            value={bestDay ? `${bestDay.score.toFixed(1)}` : '--'}
            label={bestDay ? `Best: ${bestDay.fullDate}` : 'Best day'}
            iconColor="#2BBD8E"
            bgClass="bg-[#F0FDF9]"
            borderClass="border-[#A7F3D0]"
          />
          <StatCard
            icon={Frown}
            value={lowestDay ? `${lowestDay.score.toFixed(1)}` : '--'}
            label={lowestDay ? `Lowest: ${lowestDay.fullDate}` : 'Lowest day'}
            iconColor="#F5A623"
            bgClass="bg-[#FFFBEB]"
            borderClass="border-[#FDE68A]"
          />
        </div>
      )}

      {/* ── Area Chart ── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <BarChart2 size={16} className="text-[#718096]" />
          <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096]">
            {period === '7d' ? '7-Day' : '30-Day'} Mood Chart
          </h3>
        </div>

        {loading ? (
          <Skeleton className="h-56" />
        ) : chartData.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-[#718096]">
            <Calendar size={36} className="opacity-30 mb-3" />
            <p className="text-[14px] font-500">No mood data yet.</p>
            <p className="text-[12px] mt-1">Chat with Saathi to start tracking your mood!</p>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4A9EE8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4A9EE8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="xLabel"
                  tick={{ fontSize: 12, fill: '#718096', fontFamily: 'Inter' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  domain={[0, 10]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  tick={{ fontSize: 12, fill: '#718096', fontFamily: 'Inter' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                {/* Reference line at 3 — "negative" threshold */}
                <ReferenceLine
                  y={3}
                  stroke="#FCA5A5"
                  strokeDasharray="4 4"
                  label={{ value: '3', position: 'right', fontSize: 11, fill: '#EF4444' }}
                />
                {/* Reference line at 7 — "positive" threshold */}
                <ReferenceLine
                  y={7}
                  stroke="#6EE7B7"
                  strokeDasharray="4 4"
                  label={{ value: '7', position: 'right', fontSize: 11, fill: '#2BBD8E' }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#4A9EE8"
                  strokeWidth={2.5}
                  fill="url(#moodGradient)"
                  dot={{ fill: '#4A9EE8', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 7, fill: '#2BBD8E' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Sentiment Breakdown ── */}
      {!loading && chartData.length > 0 && (
        <div className="card p-5">
          <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096] mb-4">
            Sentiment Breakdown
          </h3>
          <div className="space-y-3">
            <SentimentBar
              label="Positive"
              count={positive}
              total={total}
              color="#2BBD8E"
              bg="bg-[#D1FAE5]"
            />
            <SentimentBar
              label="Neutral"
              count={neutral}
              total={total}
              color="#F5A623"
              bg="bg-[#FEF3C7]"
            />
            <SentimentBar
              label="Negative"
              count={negative}
              total={total}
              color="#EF4444"
              bg="bg-[#FEE2E2]"
            />
          </div>
        </div>
      )}

      {/* ── Mood Score Guide ── */}
      <div className="card p-5">
        <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096] mb-3">
          Mood Score Guide
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { range: '8–10', label: 'Great', emoji: '😄', bg: 'bg-[#D1FAE5]', text: 'text-[#065F46]' },
            { range: '6–7',  label: 'Good',  emoji: '😊', bg: 'bg-[#DBEAFE]', text: 'text-[#1E40AF]' },
            { range: '4–5',  label: 'Okay',  emoji: '😐', bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]' },
            { range: '1–3',  label: 'Low',   emoji: '😔', bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]' },
          ].map(({ range, label, emoji, bg, text }) => (
            <div key={range} className={`${bg} ${text} rounded-xl p-3 text-center`}>
              <p className="text-[22px]">{emoji}</p>
              <p className="text-[13px] font-700 mt-1">{label}</p>
              <p className="text-[12px] opacity-80">{range}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

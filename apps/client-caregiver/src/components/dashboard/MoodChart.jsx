import React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'

/**
 * Custom tooltip for the mood chart.
 */
const MoodTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const score = payload[0]?.value
  const emoji = score >= 8 ? '😄' : score >= 6 ? '🙂' : score >= 4 ? '😐' : score >= 2 ? '😟' : '😢'
  return (
    <div className="bg-white border border-gray-200 rounded-[8px] px-3 py-2 shadow-cardHover text-sm">
      <p className="font-semibold text-[#1A202C]">{label}</p>
      <p className="text-[#4A9EE8] font-bold">
        {emoji} {score?.toFixed(1)} / 10
      </p>
    </div>
  )
}

/**
 * MoodChart — 7-day mood trend line chart using Recharts AreaChart.
 *
 * @param {{
 *   data: Array<{ date: string, score: number }>,
 *   loading: boolean
 * }} props
 */
export default function MoodChart({ data = [], loading = false }) {
  // Format dates for display
  const chartData = data.map((d) => ({
    ...d,
    dateLabel: d.date
      ? (() => {
          try {
            return format(parseISO(d.date), 'EEE dd')
          } catch {
            return d.date
          }
        })()
      : d.dateLabel || d.date,
  }))

  if (loading) {
    return (
      <div className="card">
        <div className="skeleton h-5 w-36 mb-4 rounded" />
        <div className="skeleton h-48 w-full rounded" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-[#1A202C] mb-4">7-Day Mood Trend</h3>
        <div className="h-48 flex items-center justify-center text-[#718096] text-sm">
          No mood data available for this week.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-[#1A202C]">7-Day Mood Trend</h3>
        <div className="flex items-center gap-4 text-xs text-[#718096]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] inline-block" />
            Low (&lt;3)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2BBD8E] inline-block" />
            Good (≥7)
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4A9EE8" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#4A9EE8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 11, fill: '#718096' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            tick={{ fontSize: 11, fill: '#718096' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<MoodTooltip />} />
          {/* Low mood reference line */}
          <ReferenceLine
            y={3}
            stroke="#EF4444"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: 'Low', position: 'right', fontSize: 10, fill: '#EF4444' }}
          />
          {/* Good mood reference line */}
          <ReferenceLine
            y={7}
            stroke="#2BBD8E"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: 'Good', position: 'right', fontSize: 10, fill: '#2BBD8E' }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#4A9EE8"
            strokeWidth={2.5}
            fill="url(#moodGradient)"
            dot={{ r: 4, fill: '#4A9EE8', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: '#4A9EE8', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

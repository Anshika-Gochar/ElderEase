import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import {
  fetchAdherence,
  selectAdherenceData,
  selectAdherenceLoading,
} from '../../store/slices/dashboardSlice'

// ─── Color helper ─────────────────────────────────────────────────────────────

/**
 * Get bar fill colour based on adherence percentage.
 * >= 90  → brand-green
 * >= 70  → brand-amber
 * <  70  → brand-red
 * null   → gray (no data yet)
 *
 * @param {number|null} pct
 * @returns {string} hex colour
 */
function getBarColor(pct) {
  if (pct === null || pct === undefined) return '#CBD5E0'
  if (pct >= 90) return '#2BBD8E'
  if (pct >= 70) return '#F5A623'
  return '#EF4444'
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const AdherenceTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const entry = payload[0]?.payload
  const pct = entry?.adherencePct
  return (
    <div className="bg-white border border-gray-200 rounded-[8px] px-3 py-2 shadow-lg text-sm min-w-[140px]">
      <p className="font-semibold text-[#1A202C] mb-1 truncate">{label}</p>
      {pct !== null && pct !== undefined ? (
        <>
          <p className="font-bold" style={{ color: getBarColor(pct) }}>
            {pct}% adherence
          </p>
          <p className="text-[11px] text-[#718096] mt-0.5">
            {entry.taken} taken · {entry.missed} missed
          </p>
        </>
      ) : (
        <p className="text-[#718096]">No data yet</p>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AdherenceSkeleton() {
  return (
    <div className="card mt-4">
      <div className="skeleton h-4 w-36 mb-5 rounded" />
      <div className="flex items-end gap-2 h-44">
        {[65, 80, 50, 90, 45, 70].map((h, i) => (
          <div
            key={i}
            className="skeleton rounded flex-1"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── AdherenceChart ───────────────────────────────────────────────────────────

/**
 * Per-medication adherence bar chart.
 * Fetches data from Redux (via fetchAdherence thunk) when elderId changes.
 *
 * Bar colours:
 *   >= 90% → #2BBD8E (green)
 *   >= 70% → #F5A623 (amber)
 *   <  70% → #EF4444 (red)
 *   null   → #CBD5E0 (gray — no logs yet)
 *
 * @param {{ elderId: string }} props
 */
export default function AdherenceChart({ elderId }) {
  const dispatch = useDispatch()
  const data = useSelector(selectAdherenceData)
  const loading = useSelector(selectAdherenceLoading)

  useEffect(() => {
    if (elderId) {
      dispatch(fetchAdherence(elderId))
    }
  }, [elderId, dispatch])

  if (loading) return <AdherenceSkeleton />

  if (!data || data.length === 0) {
    return (
      <div className="card mt-4">
        <h3 className="text-sm font-semibold text-[#1A202C] mb-4">
          Medication Adherence (14 days)
        </h3>
        <div className="h-44 flex flex-col items-center justify-center text-[#718096] text-sm gap-2">
          <span className="text-2xl">💊</span>
          <p>No medication data yet</p>
        </div>
      </div>
    )
  }

  // Prepare chart data — use medication name as X-axis label
  const chartData = data.map((med) => ({
    ...med,
    label: med.name.length > 12 ? med.name.slice(0, 11) + '…' : med.name,
    displayPct: med.adherencePct ?? 0,
  }))

  // Average (exclude null values)
  const withData = data.filter((d) => d.adherencePct !== null)
  const avg =
    withData.length > 0
      ? Math.round(
          withData.reduce((sum, d) => sum + d.adherencePct, 0) / withData.length
        )
      : null

  return (
    <div className="card mt-4">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-[#1A202C]">
          Medication Adherence (14 days)
        </h3>
        {avg !== null && (
          <span className="text-xs text-[#718096] bg-[#F5F4F0] px-2.5 py-1 rounded-full">
            Avg:{' '}
            <span
              className="font-semibold"
              style={{ color: getBarColor(avg) }}
            >
              {avg}%
            </span>
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
          barSize={20}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#718096' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 10, fill: '#718096' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<AdherenceTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          {avg !== null && (
            <ReferenceLine
              y={avg}
              stroke="#718096"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `Avg ${avg}%`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#718096',
              }}
            />
          )}
          <Bar dataKey="displayPct" radius={[5, 5, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={getBarColor(entry.adherencePct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-[#718096]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#2BBD8E] inline-block" />≥ 90%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#F5A623] inline-block" />
          70–89%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444] inline-block" />&lt; 70%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#CBD5E0] inline-block" />No data
        </span>
      </div>
    </div>
  )
}

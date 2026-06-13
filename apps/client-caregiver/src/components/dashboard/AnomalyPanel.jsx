// apps/client-caregiver/src/components/dashboard/AnomalyPanel.jsx  NEW
import React, { useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AlertTriangle, CheckCircle, Clock, ShieldCheck } from 'lucide-react'
import { format, parseISO } from 'date-fns'

import {
  fetchAnomalyFlags,
  resolveAnomalyFlag,
  selectAnomalyFlags,
  selectAnomalyLoading,
  selectAnomalyError,
} from '../../store/slices/alertSlice.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map machine anomaly type → human-readable label */
const TYPE_LABELS = {
  medication_non_adherence: 'Missed Medications',
  severe_low_mood:          'Severe Low Mood',
  social_withdrawal:        'Social Withdrawal',
  sos_triggered:            'SOS Triggered',
  low_task_completion:      'Low Task Completion',
  ml_detected_anomaly:      'AI Behaviour Flag',
  anomaly:                  'Anomaly Detected',
}

/** Map severity → visual styles */
const SEVERITY_STYLES = {
  high:   {
    border:    'border-l-[#EF4444]',
    badge:     'bg-[#FEE2E2] text-[#991B1B]',
    icon:      '#EF4444',
    label:     'High',
  },
  medium: {
    border:    'border-l-[#F5A623]',
    badge:     'bg-[#FEF3C7] text-[#92400E]',
    icon:      '#F5A623',
    label:     'Medium',
  },
  low:    {
    border:    'border-l-[#4A9EE8]',
    badge:     'bg-[#DBEAFE] text-[#1E40AF]',
    icon:      '#4A9EE8',
    label:     'Low',
  },
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try { return format(parseISO(dateStr), 'MMM d, h:mm a') } catch { return dateStr }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse border-l-4 border-l-[#E2E8F0] bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="h-4 w-36 bg-[#E2E8F0] rounded" />
        <div className="h-5 w-14 bg-[#E2E8F0] rounded-full" />
      </div>
      <div className="h-3 w-48 bg-[#E2E8F0] rounded mb-1" />
      <div className="h-3 w-24 bg-[#E2E8F0] rounded" />
    </div>
  )
}

// ─── Anomaly Card ─────────────────────────────────────────────────────────────

function AnomalyCard({ flag, onResolve, resolving }) {
  const styles = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.medium
  const typeLabel = TYPE_LABELS[flag.type] || flag.type

  return (
    <div
      className={`border-l-4 ${styles.border} bg-white rounded-xl p-4 shadow-sm
                  transition-all duration-200 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Icon + title */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <AlertTriangle
            size={18}
            style={{ color: styles.icon }}
            className="flex-shrink-0 mt-0.5"
          />
          <div className="min-w-0">
            <p className="text-[14px] font-700 text-[#1A202C] leading-snug">{typeLabel}</p>
            {flag.details?.triggeredField && (
              <p className="text-[12px] text-[#718096] mt-0.5">
                {flag.details.triggeredField.replace(/([A-Z])/g, ' $1').trim()}:{' '}
                <span className="font-600">{String(flag.details.fieldValue)}</span>
              </p>
            )}
            {flag.createdAt && (
              <div className="flex items-center gap-1 mt-1">
                <Clock size={11} className="text-[#A0AEC0]" />
                <span className="text-[11px] text-[#A0AEC0]">{formatDate(flag.createdAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Severity badge + resolve button */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-[11px] font-700 px-2 py-0.5 rounded-full ${styles.badge}`}>
            {styles.label}
          </span>
          <button
            id={`resolve-anomaly-${flag._id}`}
            onClick={() => onResolve(flag._id)}
            disabled={resolving}
            className="text-[11px] font-600 text-[#718096] hover:text-[#2BBD8E]
                       flex items-center gap-1 transition-colors duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle size={12} />
            {resolving ? 'Resolving…' : 'Mark resolved'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AnomalyPanel ─────────────────────────────────────────────────────────────

/**
 * Displays unresolved anomaly flags for a specific elder.
 * Fetches on mount and when elderId changes.
 * Each flag has a "Mark resolved" button that calls the AI service
 * via PATCH /api/ai/anomaly/:id/resolve.
 *
 * @param {{ elderId: string }} props
 */
export default function AnomalyPanel({ elderId }) {
  const dispatch  = useDispatch()
  const flags     = useSelector(selectAnomalyFlags)
  const loading   = useSelector(selectAnomalyLoading)
  const error     = useSelector(selectAnomalyError)

  // Local state for which flag is being resolved
  const [resolvingId, setResolvingId] = React.useState(null)

  const loadFlags = useCallback(() => {
    if (elderId) dispatch(fetchAnomalyFlags(elderId))
  }, [dispatch, elderId])

  useEffect(() => {
    loadFlags()
  }, [loadFlags])

  const handleResolve = async (anomalyId) => {
    setResolvingId(anomalyId)
    try {
      await dispatch(resolveAnomalyFlag(anomalyId)).unwrap()
    } catch (e) {
      // Error is in Redux state — user can retry
    } finally {
      setResolvingId(null)
    }
  }

  // Filter to only unresolved flags for this elder
  const unresolvedFlags = flags.filter(
    (f) => f.resolvedAt == null && (f.elderId === elderId || !f.elderId)
  )

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-[#F5A623]" />
          <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096]">
            Anomaly Flags
          </h3>
          {unresolvedFlags.length > 0 && (
            <span className="bg-[#FEE2E2] text-[#991B1B] text-[11px] font-700 px-2 py-0.5 rounded-full">
              {unresolvedFlags.length}
            </span>
          )}
        </div>
        <button
          id="refresh-anomaly-flags"
          onClick={loadFlags}
          disabled={loading}
          className="text-[12px] text-[#4A9EE8] hover:text-[#2563EB] font-500
                     transition-colors duration-200 disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-3 py-2">
          <p className="text-[12px] text-[#991B1B]">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && unresolvedFlags.length === 0 ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : unresolvedFlags.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-8 text-[#718096]">
          <ShieldCheck size={36} className="text-[#2BBD8E] mb-3 opacity-70" />
          <p className="text-[14px] font-600 text-[#2BBD8E]">No anomalies detected</p>
          <p className="text-[12px] mt-1 text-[#A0AEC0]">
            Everything looks normal for this elder.
          </p>
        </div>
      ) : (
        /* Anomaly cards */
        <div className="space-y-3">
          {unresolvedFlags.map((flag) => (
            <AnomalyCard
              key={flag._id}
              flag={flag}
              onResolve={handleResolve}
              resolving={resolvingId === flag._id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

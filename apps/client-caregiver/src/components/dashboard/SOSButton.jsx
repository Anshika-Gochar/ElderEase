import React, { useState } from 'react'
import { useSelector } from 'react-redux'
import { AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import { selectSosHistory } from '../../store/slices/alertSlice.js'

/**
 * SOSButton — Displays SOS history in a collapsible timeline panel.
 * Shows a prominent SOS history header with past events listed chronologically.
 *
 * @param {{ elderId: string|null }} props
 */
export default function SOSButton({ elderId }) {
  const sosHistory = useSelector(selectSosHistory)
  const [expanded, setExpanded] = useState(false)

  const elderSosHistory = elderId
    ? sosHistory.filter((s) => {
        const id = typeof s.elderId === 'object' ? s.elderId?._id : s.elderId
        return id === elderId
      })
    : sosHistory

  return (
    <div className="card">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-100 rounded-[8px] flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-[#1A202C]">SOS History</h3>
            <p className="text-xs text-[#718096]">
              {elderSosHistory.length} event{elderSosHistory.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {elderSosHistory.length > 0 && (
            <span className="badge badge-red">{elderSosHistory.length}</span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#718096]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#718096]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-4">
          {elderSosHistory.length === 0 ? (
            <div className="text-center py-6">
              <span className="text-2xl block mb-2">✅</span>
              <p className="text-sm text-[#718096]">No SOS events recorded. Great news!</p>
            </div>
          ) : (
            <div className="space-y-0 relative">
              {/* Timeline line */}
              <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-gray-100" />

              {elderSosHistory.map((event, i) => {
                const timeAgo = event.createdAt
                  ? formatDistanceToNow(parseISO(event.createdAt), { addSuffix: true })
                  : 'Unknown time'
                const dateStr = event.createdAt
                  ? format(parseISO(event.createdAt), 'MMM d, yyyy • h:mm a')
                  : ''
                const isResolved = event.isRead || event.resolved || !!event.meta?.resolvedAt
                return (
                  <div key={event._id || i} className="flex gap-4 pb-4 relative">
                    {/* Timeline dot */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 mt-0.5 ${
                        isResolved ? 'bg-green-100' : 'bg-red-100'
                      }`}
                    >
                      <span className="text-xs">{isResolved ? '✅' : '🚨'}</span>
                    </div>

                    <div className="flex-1 bg-[#F5F4F0] rounded-[8px] p-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-xs font-semibold text-[#1A202C]">
                            {event.message || 'SOS Alert triggered'}
                          </p>
                          <p className="text-[11px] text-[#718096] mt-0.5">{dateStr}</p>
                        </div>
                        <span
                          className={isResolved ? 'badge badge-green' : 'badge badge-red'}
                        >
                          {isResolved ? 'Resolved' : 'Unresolved'}
                        </span>
                      </div>
                      {event.location && (
                        <p className="text-[11px] text-[#718096] mt-1.5">
                          📍 {event.location}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

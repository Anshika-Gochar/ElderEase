import React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, AlertCircle, Info, Clock } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'

/**
 * Returns the icon and colour for a given alert type/severity.
 * @param {string} type - Alert type: 'sos' | 'anomaly' | 'missed_meds' | 'low_mood' | etc.
 * @param {string} severity - 'critical' | 'high' | 'medium' | 'low'
 */
const getAlertStyle = (type, severity) => {
  if (type === 'sos' || severity === 'critical') {
    return {
      icon: <AlertTriangle className="w-4 h-4 text-[#EF4444]" />,
      dot: 'bg-[#EF4444]',
      bg: 'bg-red-50 border-red-200',
      label: 'SOS',
      labelColor: 'badge-red',
    }
  }
  if (severity === 'high' || type === 'anomaly') {
    return {
      icon: <AlertCircle className="w-4 h-4 text-[#F5A623]" />,
      dot: 'bg-[#F5A623]',
      bg: 'bg-amber-50 border-amber-100',
      label: 'Anomaly',
      labelColor: 'badge-amber',
    }
  }
  if (type === 'missed_meds') {
    return {
      icon: <Info className="w-4 h-4 text-[#4A9EE8]" />,
      dot: 'bg-[#4A9EE8]',
      bg: 'bg-blue-50 border-blue-100',
      label: 'Missed Med',
      labelColor: 'badge-blue',
    }
  }
  return {
    icon: <Info className="w-4 h-4 text-[#718096]" />,
    dot: 'bg-[#718096]',
    bg: 'bg-gray-50 border-gray-200',
    label: 'Alert',
    labelColor: 'badge bg-gray-100 text-gray-600',
  }
}

/**
 * AlertPanel — Shows recent alerts with type icons and timestamps.
 * SOS alerts are prominently highlighted in red.
 *
 * @param {{
 *   alerts: Array<object>,
 *   loading: boolean,
 *   elderId: string
 * }} props
 */
export default function AlertPanel({ alerts = [], loading = false, elderId }) {
  if (loading) {
    return (
      <div className="card h-full">
        <div className="skeleton h-5 w-28 mb-4 rounded" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3 mb-3">
            <div className="skeleton w-8 h-8 rounded-full" />
            <div className="flex-1">
              <div className="skeleton h-4 w-3/4 mb-1.5 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A202C]">Recent Alerts</h3>
        <Link
          to="/alerts"
          className="text-xs font-medium text-[#4A9EE8] hover:text-blue-600 transition-colors"
        >
          View all →
        </Link>
      </div>

      {alerts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="w-12 h-12 bg-[#ECFDF5] rounded-full flex items-center justify-center mb-3">
            <span className="text-2xl">✅</span>
          </div>
          <p className="text-sm font-medium text-[#1A202C]">All clear!</p>
          <p className="text-xs text-[#718096] mt-1">No recent alerts to show.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 -mr-1">
          {alerts.map((alert, i) => {
            const style = getAlertStyle(alert.type, alert.severity)
            const isSos = alert.type === 'sos' || alert.severity === 'critical'
            const timeAgo = alert.createdAt || alert.receivedAt
              ? formatDistanceToNow(parseISO(alert.createdAt || alert.receivedAt), { addSuffix: true })
              : 'Unknown time'

            return (
              <div
                key={alert._id || i}
                className={`flex items-start gap-3 p-3 rounded-[8px] border transition-all ${style.bg} ${
                  isSos ? 'sos-pulse' : ''
                } ${!alert.read ? 'ring-1 ring-inset ring-current ring-opacity-20' : ''}`}
              >
                {/* Icon */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isSos ? 'bg-red-100' : 'bg-white'
                  }`}
                >
                  {style.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={style.labelColor}>{style.label}</span>
                    {alert.elderName && (
                      <span className="text-xs text-[#718096] truncate">{alert.elderName}</span>
                    )}
                    {!alert.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4A9EE8] inline-block" />
                    )}
                  </div>
                  <p className="text-xs font-medium text-[#1A202C] truncate">
                    {alert.message || alert.description || 'Alert received'}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 text-[#718096]" />
                    <span className="text-[11px] text-[#718096]">{timeAgo}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

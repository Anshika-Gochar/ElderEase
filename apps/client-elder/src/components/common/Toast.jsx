import React, { useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

// ─── Type Config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  success: {
    icon:    CheckCircle,
    bg:      'bg-[#F0FDF9]',
    border:  'border-[#A7F3D0]',
    iconCls: 'text-[#2BBD8E]',
    titleCls: 'text-[#065F46]',
  },
  error: {
    icon:    AlertCircle,
    bg:      'bg-[#FFF5F5]',
    border:  'border-[#FED7D7]',
    iconCls: 'text-[#EF4444]',
    titleCls: 'text-[#991B1B]',
  },
  warning: {
    icon:    AlertTriangle,
    bg:      'bg-[#FFFBEB]',
    border:  'border-[#FDE68A]',
    iconCls: 'text-[#F5A623]',
    titleCls: 'text-[#92400E]',
  },
  info: {
    icon:    Info,
    bg:      'bg-[#EFF6FF]',
    border:  'border-[#BFDBFE]',
    iconCls: 'text-[#4A9EE8]',
    titleCls: 'text-[#1E40AF]',
  },
}

// ─── Toast ────────────────────────────────────────────────────────────────────

/**
 * Individual toast notification.
 * Auto-dismisses after 4 seconds. Slides in from top-right.
 *
 * @param {object} props
 * @param {string} props.id       - Unique notification ID
 * @param {'success'|'error'|'warning'|'info'} props.type
 * @param {string} props.message  - Notification text
 * @param {string} [props.title]  - Optional bold title
 * @param {function} props.onClose - Called when notification should be removed
 */
export default function Toast({ id, type = 'info', message, title, onClose }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info
  const Icon = cfg.icon

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), 4000)
    return () => clearTimeout(timer)
  }, [id, onClose])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`
        flex items-start gap-3 w-80 px-4 py-3 rounded-xl border shadow-card
        ${cfg.bg} ${cfg.border}
        animate-slide-in-right
      `}
    >
      <Icon size={18} className={`${cfg.iconCls} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        {title && (
          <p className={`text-[13px] font-600 ${cfg.titleCls}`}>{title}</p>
        )}
        <p className="text-[13px] text-[#4A5568] leading-snug">{message}</p>
      </div>
      <button
        onClick={() => onClose(id)}
        className="flex-shrink-0 text-[#718096] hover:text-[#1A202C] mt-0.5"
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  )
}

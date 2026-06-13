import React from 'react'

// ─── Color Maps ───────────────────────────────────────────────────────────────

const COLOR_MAP = {
  green: {
    value:   'text-[#2BBD8E]',
    bg:      'bg-[#F0FDF9]',
    border:  'border-[#A7F3D0]',
    iconBg:  'bg-[#D1FAE5]',
    icon:    'text-[#065F46]',
  },
  blue: {
    value:   'text-[#4A9EE8]',
    bg:      'bg-[#EFF6FF]',
    border:  'border-[#BFDBFE]',
    iconBg:  'bg-[#DBEAFE]',
    icon:    'text-[#1E40AF]',
  },
  amber: {
    value:   'text-[#F5A623]',
    bg:      'bg-[#FFFBEB]',
    border:  'border-[#FDE68A]',
    iconBg:  'bg-[#FEF3C7]',
    icon:    'text-[#92400E]',
  },
  red: {
    value:   'text-[#EF4444]',
    bg:      'bg-[#FFF5F5]',
    border:  'border-[#FED7D7]',
    iconBg:  'bg-[#FEE2E2]',
    icon:    'text-[#991B1B]',
  },
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

/**
 * A summary stat card shown on the dashboard.
 * Displays a large colored value, a label, and an optional icon.
 *
 * @param {object} props
 * @param {string}  props.value   - Main display value e.g. "2/3", "7.2", "4/5"
 * @param {string}  props.label   - Descriptive label below the value
 * @param {'green'|'blue'|'amber'|'red'} props.color - Brand color theme
 * @param {React.ElementType} [props.icon] - Lucide icon component
 * @param {string}  [props.subtitle] - Optional small text below label
 */
export default function StatCard({ value, label, color = 'green', icon: Icon, subtitle }) {
  const c = COLOR_MAP[color] || COLOR_MAP.green

  return (
    <div
      className={`card p-5 flex items-start gap-4 animate-fade-in ${c.bg} border ${c.border}`}
    >
      {/* Icon */}
      {Icon && (
        <div className={`w-11 h-11 rounded-xl ${c.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon size={22} className={c.icon} />
        </div>
      )}

      {/* Text */}
      <div className="min-w-0">
        <p className={`text-[28px] font-700 leading-none ${c.value}`}>{value}</p>
        <p className="text-[14px] text-[#4A5568] font-500 mt-1 leading-snug">{label}</p>
        {subtitle && (
          <p className="text-[12px] text-[#718096] mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

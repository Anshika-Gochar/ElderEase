import React from 'react'

/**
 * Centered loading spinner using ElderEase brand green.
 * @param {object} props
 * @param {string} [props.size='md'] - 'sm' | 'md' | 'lg'
 * @param {string} [props.message]  - Optional text below spinner
 */
export default function LoadingSpinner({ size = 'md', message }) {
  const sizeMap = {
    sm: 'w-5 h-5 border-2',
    md: 'w-9 h-9 border-[3px]',
    lg: 'w-14 h-14 border-4',
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      <div
        className={`${sizeMap[size]} border-[#E2E8F0] border-t-[#2BBD8E] rounded-full animate-spin`}
        aria-hidden="true"
      />
      {message && (
        <p className="text-[14px] text-[#718096]">{message}</p>
      )}
      <span className="sr-only">Loading…</span>
    </div>
  )
}

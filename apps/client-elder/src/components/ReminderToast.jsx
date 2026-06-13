import React, { useEffect, useState, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { X, Pill, Clock, Check, Loader2 } from 'lucide-react'
import { takeDose } from '../store/slices/medSlice'
import { addNotification } from '../store/slices/uiSlice'

/**
 * A single reminder toast card.
 *
 * @param {{
 *   toast: {
 *     id: string,
 *     medicationId: string,
 *     medicationName: string,
 *     dose: string,
 *     scheduledTime: string,   // HH:MM display string
 *     scheduledAt: string,     // ISO timestamp for the API call
 *     instructions?: string,
 *     color?: string,
 *   },
 *   onDismiss: (id: string) => void,
 *   onTaken: (id: string) => void,
 * }} props
 */
function ToastCard({ toast, onDismiss, onTaken }) {
  const dispatch = useDispatch()
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'done' | 'error'
  const [errMsg, setErrMsg] = useState('')

  const handleTake = async () => {
    setStatus('loading')
    setErrMsg('')

    const result = await dispatch(
      takeDose({
        medicationId: toast.medicationId,
        scheduledTime: toast.scheduledAt,
      })
    )

    if (result.error) {
      setStatus('error')
      setErrMsg(result.payload || 'Could not record dose.')
      setTimeout(() => setStatus('idle'), 3000)
    } else {
      setStatus('done')
      dispatch(
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Dose recorded!',
          message: `${toast.medicationName} marked as taken.`,
        })
      )
      // Auto-close after brief success flash
      setTimeout(() => onTaken(toast.id), 800)
    }
  }

  return (
    <div
      className="w-80 bg-white rounded-[14px] shadow-2xl border border-[#E2E8F0] overflow-hidden"
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      {/* Coloured top stripe */}
      <div className="h-1" style={{ backgroundColor: toast.color || '#2BBD8E' }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${toast.color || '#2BBD8E'}22` }}
            >
              <Pill size={18} style={{ color: toast.color || '#2BBD8E' }} />
            </div>
            <div>
              <p className="text-[13px] font-700 text-[#1A202C] leading-tight">
                {toast.medicationName}
              </p>
              <p className="text-[12px] text-[#718096]">{toast.dose}</p>
            </div>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-[#A0AEC0] hover:text-[#718096] transition-colors mt-0.5 flex-shrink-0"
            aria-label="Dismiss reminder"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scheduled time */}
        <div className="flex items-center gap-1.5 text-[12px] text-[#718096] mb-3">
          <Clock size={12} />
          <span>Scheduled at {toast.scheduledTime}</span>
        </div>

        {/* Instructions */}
        {toast.instructions && (
          <p className="text-[12px] text-[#A0AEC0] mb-3 italic">{toast.instructions}</p>
        )}

        {/* Error */}
        {status === 'error' && (
          <p className="text-[12px] text-[#EF4444] mb-2">{errMsg}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onDismiss(toast.id)}
            className="flex-1 py-2 rounded-lg border border-[#E2E8F0] text-[#718096] text-[13px] font-600 hover:bg-gray-50 transition-all"
          >
            Dismiss
          </button>
          <button
            onClick={handleTake}
            disabled={status === 'loading' || status === 'done'}
            className="flex-1 py-2 rounded-lg text-white text-[13px] font-600 transition-all flex items-center justify-center gap-1.5 disabled:opacity-70"
            style={{ backgroundColor: toast.color || '#2BBD8E' }}
          >
            {status === 'loading' && <><Loader2 size={13} className="animate-spin" /> Recording…</>}
            {status === 'done'    && <><Check size={13} /> Taken!</>}
            {(status === 'idle' || status === 'error') && 'Take now'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ReminderToast Container ──────────────────────────────────────────────────

/**
 * Listens for the 'dose:reminder' socket event and renders a stack of
 * persistent reminder toast cards in the top-right corner of the screen.
 *
 * Mount this once in the root layout (App.jsx) so it persists across
 * page navigation.
 *
 * @param {{ socket: import('socket.io-client').Socket | null }} props
 */
export default function ReminderToast({ socket }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((payload) => {
    setToasts((prev) => {
      // Deduplicate: don't add if same medicationId + scheduledAt already in queue
      const exists = prev.some(
        (t) =>
          t.medicationId === payload.medicationId &&
          t.scheduledAt === payload.scheduledAt
      )
      if (exists) return prev

      return [
        ...prev,
        {
          id: `${payload.medicationId}-${Date.now()}`,
          medicationId: payload.medicationId,
          medicationName: payload.medicationName,
          dose: payload.dose,
          scheduledTime: payload.scheduledTime,
          // Reconstruct ISO timestamp from HH:MM string for the API call
          scheduledAt: (() => {
            if (payload.scheduledAt) return payload.scheduledAt
            // Build today's local date at the given HH:MM
            const [hh, mm] = (payload.scheduledTime || '00:00').split(':').map(Number)
            const d = new Date()
            d.setHours(hh, mm, 0, 0)
            return d.toISOString()
          })(),
          instructions: payload.instructions || '',
          color: payload.color || '#2BBD8E',
        },
      ]
    })
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('dose:reminder', addToast)

    return () => {
      socket.off('dose:reminder', addToast)
    }
  }, [socket, addToast])

  if (toasts.length === 0) return null

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      <div
        className="fixed top-5 right-5 z-[9999] flex flex-col gap-3"
        aria-live="polite"
        aria-label="Medication reminders"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onDismiss={dismissToast}
            onTaken={dismissToast}
          />
        ))}
      </div>
    </>
  )
}

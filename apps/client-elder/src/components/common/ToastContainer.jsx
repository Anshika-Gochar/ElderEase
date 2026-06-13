import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createPortal } from 'react-dom'
import Toast from './Toast'
import { selectNotifications, removeNotification } from '../../store/slices/uiSlice'

/**
 * Renders all active toast notifications via a React Portal.
 * Positioned at top-right of the viewport.
 */
export default function ToastContainer() {
  const dispatch = useDispatch()
  const notifications = useSelector(selectNotifications)

  const handleClose = useCallback(
    (id) => dispatch(removeNotification(id)),
    [dispatch]
  )

  if (notifications.length === 0) return null

  return createPortal(
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2"
      aria-label="Notifications"
    >
      {notifications.map((n) => (
        <Toast
          key={n.id}
          id={n.id}
          type={n.type}
          title={n.title}
          message={n.message}
          onClose={handleClose}
        />
      ))}
    </div>,
    document.body
  )
}

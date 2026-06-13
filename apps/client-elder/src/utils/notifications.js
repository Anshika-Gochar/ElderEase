// apps/client-elder/src/utils/notifications.js  NEW
/**
 * FCM push notification utilities for the elder app.
 *
 * requestNotificationPermission() — asks browser for permission + gets FCM token.
 * registerFCMToken(token)          — POSTs the token to the backend.
 *
 * Usage in App.jsx:
 *   const token = await requestNotificationPermission()
 *   if (token) await registerFCMToken(token)
 *
 * Required VITE env vars (.env):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *   VITE_FIREBASE_VAPID_KEY   (from Firebase Console → Project Settings → Cloud Messaging)
 *
 * If any var is missing the functions log a warning and return null — the app
 * continues to work without push notifications.
 */

import axiosInstance from '../api/axiosConfig.js'

const FIREBASE_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

const isFirebaseConfigured =
  FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.projectId &&
  FIREBASE_CONFIG.messagingSenderId &&
  VAPID_KEY

// ─── requestNotificationPermission ───────────────────────────────────────────

/**
 * Request browser Notification permission and retrieve the FCM token.
 *
 * @returns {Promise<string|null>} FCM token, or null if unavailable/denied
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[FCM] Notifications not supported in this browser')
    return null
  }

  if (!isFirebaseConfigured) {
    console.warn('[FCM] Firebase env vars not set — push notifications disabled')
    return null
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.info('[FCM] Notification permission denied by user')
      return null
    }

    // Dynamically import Firebase to avoid bundle bloat when unconfigured
    const { initializeApp, getApps, getApp } = await import('firebase/app')
    const { getMessaging, getToken }          = await import('firebase/messaging')

    // Avoid re-initialising if already done (hot-reload safe)
    const app       = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
    const messaging = getMessaging(app)

    const token = await getToken(messaging, { vapidKey: VAPID_KEY })

    if (token) {
      console.log('[FCM] Token obtained:', token.slice(0, 20) + '…')
      return token
    }

    console.warn('[FCM] Could not retrieve FCM token — check VAPID key and service worker')
    return null
  } catch (err) {
    console.error('[FCM] requestNotificationPermission error:', err)
    return null
  }
}

// ─── registerFCMToken ─────────────────────────────────────────────────────────

/**
 * POST the FCM token to the backend so the server can send push notifications
 * to this device.
 *
 * Uses localStorage flag 'fcm_token_hash' to avoid re-registering on every
 * page load (only re-registers if the token has changed).
 *
 * @param {string} token  FCM registration token
 * @returns {Promise<boolean>} true if registered (or already up-to-date)
 */
export async function registerFCMToken(token) {
  if (!token) return false

  // Skip if we already registered this exact token this session
  const storedHash = localStorage.getItem('fcm_token_hash')
  const tokenHash  = btoa(token.slice(-20))   // lightweight identity check

  if (storedHash === tokenHash) {
    console.log('[FCM] Token unchanged — skipping re-registration')
    return true
  }

  try {
    await axiosInstance.post('/users/fcm-token', { fcmToken: token })
    localStorage.setItem('fcm_token_hash', tokenHash)
    console.log('[FCM] Token registered with backend')
    return true
  } catch (err) {
    console.error('[FCM] registerFCMToken failed:', err)
    return false
  }
}

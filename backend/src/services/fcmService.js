// backend/src/services/fcmService.js  MODIFIED
'use strict';

/**
 * Firebase Cloud Messaging push notification service.
 *
 * Pattern: if Firebase Admin SDK is initialised (FIREBASE_PROJECT_ID,
 * FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL all present), real FCM
 * messages are sent. Otherwise logs [STUB-FCM] — app never crashes.
 *
 * The firebase-admin SDK is initialised in src/config/firebase.js.
 * We import the admin app from there to avoid double-initialisation.
 */

import admin from '../config/firebase.js';

const isConfigured = !!(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_PRIVATE_KEY &&
  process.env.FIREBASE_CLIENT_EMAIL
);

// ─── sendPush ─────────────────────────────────────────────────────────────────

/**
 * Send a push notification to a single FCM token.
 *
 * @param {string} fcmToken  Device registration token
 * @param {string} title     Notification title
 * @param {string} body      Notification body text
 * @param {object} [data]    Optional key-value data payload
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
export async function sendPush(fcmToken, title, body, data) {
  if (!isConfigured) {
    console.log(`[STUB-FCM] sendPush → title="${title}" body="${body}"`);
    return { success: true, stub: true };
  }

  if (!fcmToken) {
    console.warn('[FCM] sendPush skipped — no FCM token for recipient');
    return { success: false, reason: 'no-token' };
  }

  try {
    const messageId = await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          )
        : {},
    });
    console.log(`[FCM] Push sent → messageId=${messageId}`);
    return { success: true, messageId };
  } catch (err) {
    // Expired / unregistered token — log warning, do NOT throw
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token'
    ) {
      console.warn(`[FCM] Token expired or invalid — consider removing it from DB`);
      return { success: false, reason: 'token-expired' };
    }
    // All other errors — log but do not crash
    console.error(`[FCM] sendPush error → ${err.code || err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── sendPushToMultiple ───────────────────────────────────────────────────────

/**
 * Send a push notification to multiple FCM tokens at once.
 *
 * @param {string[]} fcmTokens  Array of device registration tokens
 * @param {string}   title      Notification title
 * @param {string}   body       Notification body text
 * @param {object}   [data]     Optional data payload
 * @returns {Promise<{ successCount: number, failureCount: number }>}
 */
export async function sendPushToMultiple(fcmTokens, title, body, data) {
  if (!fcmTokens?.length) return { successCount: 0, failureCount: 0 };

  if (!isConfigured) {
    console.log(`[STUB-FCM] sendPushToMultiple → ${fcmTokens.length} token(s) | title="${title}"`);
    return { successCount: fcmTokens.length, failureCount: 0, stub: true };
  }

  const validTokens = fcmTokens.filter(Boolean);
  if (!validTokens.length) return { successCount: 0, failureCount: 0 };

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: validTokens,
      notification: { title, body },
      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          )
        : {},
    });

    console.log(
      `[FCM] Multicast: ${response.successCount} sent, ${response.failureCount} failed`
    );

    // Log per-token failures for diagnostics
    response.responses.forEach((r, i) => {
      if (!r.success) {
        console.warn(`[FCM] Token[${i}] failed: ${r.error?.code || r.error?.message}`);
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    console.error(`[FCM] sendPushToMultiple error → ${err.message}`);
    return { successCount: 0, failureCount: validTokens.length };
  }
}

// ─── sendMedicationReminder ───────────────────────────────────────────────────

/**
 * Send a medication reminder push to a single elder.
 *
 * @param {{ fcmToken: string, name: string }} user       Elder user object
 * @param {{ name: string, dose: string, scheduledTime: string }} medication
 * @returns {Promise<{ success: boolean }>}
 */
export async function sendMedicationReminder(user, medication) {
  const title = '💊 Medication Reminder';
  const body  = `Time to take ${medication.name} (${medication.dose}) — scheduled for ${medication.scheduledTime}`;
  return sendPush(user.fcmToken, title, body, {
    type:           'medication_reminder',
    medicationName: medication.name,
    scheduledTime:  medication.scheduledTime,
  });
}

// ─── sendSOSAlert ─────────────────────────────────────────────────────────────

/**
 * Send an SOS push notification to a caregiver.
 *
 * @param {string} fcmToken   Caregiver FCM token
 * @param {string} elderName  Name of the elder who triggered SOS
 * @returns {Promise<{ success: boolean }>}
 */
export async function sendSOSAlert(fcmToken, elderName) {
  return sendPush(
    fcmToken,
    '🚨 SOS Alert',
    `${elderName} has triggered an emergency alert. Please check on them immediately.`,
    { type: 'sos' }
  );
}

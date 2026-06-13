// backend/src/services/twilioService.js  MODIFIED
'use strict';

/**
 * Twilio SMS + Voice service.
 *
 * Pattern: if TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER
 * are all present in env, real Twilio SDK calls are made.
 * Otherwise logs [STUB-TWILIO] — app never crashes from missing credentials.
 *
 * Environment variables:
 *   TWILIO_ACCOUNT_SID      — AC... string from Twilio console
 *   TWILIO_AUTH_TOKEN       — auth token from Twilio console
 *   TWILIO_PHONE_NUMBER     — E.164 purchased number (e.g. +12025551234)
 *   TWILIO_ENABLE_VOICE     — 'true' to also make voice calls on SOS
 */

import twilio from 'twilio';

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER  = process.env.TWILIO_PHONE_NUMBER;
const ENABLE_VOICE = process.env.TWILIO_ENABLE_VOICE === 'true';

const isConfigured = !!(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);

/** Lazily created Twilio client — only instantiated if credentials exist */
let _client = null;
function getClient() {
  if (!_client) _client = twilio(ACCOUNT_SID, AUTH_TOKEN);
  return _client;
}

// ─── sendSMS ─────────────────────────────────────────────────────────────────

/**
 * Send an SMS message.
 *
 * @param {string} to       Recipient phone in E.164 format (+91XXXXXXXXXX)
 * @param {string} message  Text body (max 1600 chars)
 * @returns {Promise<{ sid: string, status: string }>}
 */
export async function sendSMS(to, message) {
  if (!isConfigured) {
    console.log(`[STUB-TWILIO] sendSMS → to=${to}`);
    console.log(`[STUB-TWILIO]   body="${message}"`);
    return { sid: 'mock-sid', status: 'stub-sent' };
  }

  if (!to) {
    console.warn('[Twilio] sendSMS skipped — recipient has no phone number');
    return { sid: null, status: 'skipped-no-phone' };
  }

  try {
    const msg = await getClient().messages.create({
      to,
      from: FROM_NUMBER,
      body: message,
    });
    console.log(`[Twilio] SMS sent → SID=${msg.sid} status=${msg.status} to=${to}`);
    return { sid: msg.sid, status: msg.status };
  } catch (err) {
    // Never throw — caller must not crash if Twilio is down
    console.error(`[Twilio] sendSMS error → to=${to} | ${err.message}`);
    return { sid: null, status: 'error' };
  }
}

// ─── sendSOS ─────────────────────────────────────────────────────────────────

/**
 * Send an SOS alert: SMS + optional voice call.
 *
 * @param {string} caregiverPhone  E.164 phone of the caregiver
 * @param {string} elderName       Name of the elder who triggered SOS
 * @param {string} [message]       Optional custom message
 * @returns {Promise<{ sms: object, call: object|null }>}
 */
export async function sendSOS(caregiverPhone, elderName, message) {
  const smsBody = message
    ? `ELDEREASE SOS — ${elderName}: ${message}`
    : `ELDEREASE SOS — ${elderName} has triggered an emergency alert. Please check on them immediately.`;

  if (!isConfigured) {
    console.log(`[STUB-TWILIO] sendSOS → to=${caregiverPhone} | elder=${elderName}`);
    return { sms: { sid: 'mock-sos-sid', status: 'stub-sent' }, call: null };
  }

  // ── SMS ─────────────────────────────────────────────────────────────────────
  const smsResult = await sendSMS(caregiverPhone, smsBody);

  // ── Voice call (opt-in via TWILIO_ENABLE_VOICE=true) ────────────────────────
  let callResult = null;
  if (ENABLE_VOICE && caregiverPhone) {
    try {
      const twiml = [
        '<Response>',
        `<Say voice="alice">Emergency alert from ElderEase. ${elderName} needs immediate assistance.</Say>`,
        '<Pause length="1"/>',
        `<Say voice="alice">Please call back or check on ${elderName} right away.</Say>`,
        '</Response>',
      ].join('');

      const call = await getClient().calls.create({
        to:    caregiverPhone,
        from:  FROM_NUMBER,
        twiml,
      });
      console.log(`[Twilio] Voice call initiated → SID=${call.sid} to=${caregiverPhone}`);
      callResult = { sid: call.sid, status: call.status };
    } catch (err) {
      console.error(`[Twilio] Voice call error → to=${caregiverPhone} | ${err.message}`);
      callResult = { sid: null, status: 'error' };
    }
  }

  return { sms: smsResult, call: callResult };
}

'use strict';
import cron from 'node-cron';
import axios from 'axios';

import Medication from '../models/Medication.js';
import DoseLog from '../models/DoseLog.js';
import User from '../models/User.js';
import { emitToUser } from '../sockets/index.js';
import { EVENTS } from '../sockets/events.js';
import { sendMedicationReminder } from '../services/fcmService.js';
import { sendSMS } from '../services/twilioService.js';
import Alert from '../models/Alert.js';

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the current local time as a zero-padded 'HH:MM' string.
 * Uses local time (not UTC) to match scheduledTimes stored in local format.
 *
 * @returns {string} e.g. '08:30'
 */
function getCurrentHHMM() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Build a Date representing today's date at the given HH:MM (local time).
 * This avoids the UTC/local timezone mismatch that would occur using
 * toISOString() for time window comparisons.
 *
 * @param {string} timeStr - 'HH:MM'
 * @returns {Date}
 */
function buildScheduledDate(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Get midnight and end-of-day for today in local time as Date objects.
 * Used for nightly sweep to scope to today's doses only.
 *
 * @returns {{ dayStart: Date, dayEnd: Date }}
 */
function getTodayBounds() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

// ─── Per-minute reminder job ──────────────────────────────────────────────────

/**
 * Runs every minute.
 * Finds all medications due at the current HH:MM, creates a 'pending' DoseLog
 * if one doesn't already exist for this slot, then fires socket + FCM + SMS.
 *
 * Duplicate-guard uses a ±30-second local-time window to prevent
 * re-creating or re-notifying for the same scheduled slot.
 *
 * @async
 * @returns {Promise<void>}
 */
async function runMinuteReminderJob() {
  const currentTime = getCurrentHHMM();

  try {
    const medications = await Medication.find({
      isActive: true,
      scheduledTimes: currentTime,
    }).lean();

    if (medications.length === 0) return;

    console.log(
      `[ReminderJob] ${currentTime} — ${medications.length} medication(s) due`
    );

    for (const med of medications) {
      try {
        const elder = await User.findById(med.elderId).lean();
        if (!elder || !elder.isActive) continue;

        const scheduledDate = buildScheduledDate(currentTime);

        // ── Duplicate guard (local-time window ±30s) ──────────────────────
        // Use local Date objects — avoids UTC shift bugs on IST servers.
        const windowStart = new Date(scheduledDate.getTime() - 30_000);
        const windowEnd = new Date(scheduledDate.getTime() + 30_000);

        const existingLog = await DoseLog.findOne({
          medicationId: med._id,
          elderId: med.elderId,
          scheduledTime: { $gte: windowStart, $lte: windowEnd },
        });

        if (existingLog) {
          // Already created (regardless of status) — skip entirely
          continue;
        }

        // ── Create DoseLog with status 'pending' ──────────────────────────
        // 'pending' = reminder sent but elder has not yet confirmed or been
        // marked missed. The nightly sweep transitions pending → missed.
        await DoseLog.create({
          medicationId: med._id,
          elderId: med.elderId,
          scheduledTime: scheduledDate,
          status: 'pending',
        });

        console.log(
          `[ReminderJob] Created DoseLog [pending] for "${med.name}" | elder: ${elder.name}`
        );

        // ── Socket reminder → elder's room ────────────────────────────────
        emitToUser(elder._id.toString(), EVENTS.DOSE_REMINDER, {
          medicationId: med._id.toString(),
          medicationName: med.name,
          dose: med.dose,
          scheduledTime: currentTime,
          instructions: med.instructions || '',
          color: med.color || '#2BBD8E',
        });

        // ── FCM push notification ─────────────────────────────────────────
        if (elder.fcmToken) {
          await sendMedicationReminder(elder, med);
        }

        // ── SMS reminder ──────────────────────────────────────────────────
        if (elder.phone) {
          await sendSMS(
            elder.phone,
            `💊 ElderEase Reminder: Time to take ${med.name} (${med.dose}). Stay healthy! 😊`
          );
        }
      } catch (innerErr) {
        console.error(
          `[ReminderJob] Error processing med ${med._id}:`,
          innerErr.message
        );
      }
    }
  } catch (err) {
    console.error('[ReminderJob] Minute job failed:', err.message);
  }
}

// ─── Nightly missed-dose sweep ────────────────────────────────────────────────

/**
 * Escalation logic for missed doses.
 * Finds DoseLogs from today that are still 'pending' AND whose scheduledTime
 * is more than 30 minutes in the past (elder had time to confirm but didn't).
 * Marks them 'missed', then notifies each linked caregiver via socket + SMS.
 *
 * Called by the nightly 22:00 cron, and also by the debug endpoint.
 *
 * @async
 * @returns {Promise<{ markedMissed: number }>}
 */
export async function runNightlyMissedDoseSweep() {
  const { dayStart, dayEnd } = getTodayBounds();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  try {
    // Find all pending doses from today that are at least 30 min overdue
    const overdueLogs = await DoseLog.find({
      status: 'pending',
      scheduledTime: {
        $gte: dayStart,
        $lte: dayEnd,
        // Must be older than 30 minutes
        $lt: thirtyMinutesAgo,
      },
    }).lean();

    if (overdueLogs.length === 0) {
      console.log('[ReminderJob] Nightly sweep — no overdue pending doses.');
      return { markedMissed: 0 };
    }

    console.log(
      `[ReminderJob] Nightly sweep — marking ${overdueLogs.length} dose(s) as missed`
    );

    for (const log of overdueLogs) {
      try {
        // Mark as missed
        await DoseLog.findByIdAndUpdate(log._id, { status: 'missed' });

        // Fetch the medication for its name
        const med = await Medication.findById(log.medicationId).lean();
        const elder = await User.findById(log.elderId)
          .populate('linkedCaregivers', '_id name fcmToken phone')
          .lean();

        if (!elder) continue;

        const medicationName = med?.name || 'Unknown medication';

        const alertPayload = {
          elderId: log.elderId.toString(),
          elderName: elder.name,
          medicationId: log.medicationId.toString(),
          medicationName,
          scheduledTime: log.scheduledTime.toISOString(),
          type: 'missed_dose',
          severity: 'medium',
        };

        // Notify each linked caregiver
        for (const caregiver of elder.linkedCaregivers || []) {
          // Socket alert to caregiver's room
          emitToUser(caregiver._id.toString(), EVENTS.ALERT_MISSED, alertPayload);

          // SMS to caregiver
          if (caregiver.phone) {
            await sendSMS(
              caregiver.phone,
              `⚠️ ElderEase: ${elder.name} missed their ${medicationName} dose scheduled at ${log.scheduledTime.toLocaleTimeString()}.`
            );
          }
        }
      } catch (innerErr) {
        console.error(
          `[ReminderJob] Sweep error for log ${log._id}:`,
          innerErr.message
        );
      }
    }

    console.log(
      `[ReminderJob] Nightly sweep complete — ${overdueLogs.length} dose(s) marked missed.`
    );

    return { markedMissed: overdueLogs.length };
  } catch (err) {
    console.error('[ReminderJob] Nightly sweep failed:', err.message);
    return { markedMissed: 0 };
  }
}

// ─── Daily anomaly check ──────────────────────────────────────────────────────

/**
 * Map anomaly type → human-readable alert message (mirrors ai.js helper).
 * Duplicated here so reminderJob.js has no circular import on routes/ai.js.
 */
function buildAnomalyMessage(anomaly) {
  const messages = {
    medication_non_adherence: 'Missed 5+ doses in the last 7 days',
    severe_low_mood:          'Mood consistently below 3/10 this week',
    social_withdrawal:        'Fewer than 2 conversations with Saathi',
    sos_triggered:            'SOS button was triggered this week',
    low_task_completion:      'Completed fewer than 30% of daily tasks',
    ml_detected_anomaly:      'Unusual behaviour pattern detected by AI',
  };
  return messages[anomaly.type] || `Anomaly detected: ${anomaly.type}`;
}

/**
 * Run anomaly detection for all active elders.
 * Called daily at 09:00 by the cron job.
 * Deduplication of AnomalyFlag docs is handled by the AI service (Task 3).
 *
 * @async
 * @returns {Promise<void>}
 */
async function runDailyAnomalyCheck() {
  try {
    const elders = await User.find({ role: 'elder', isActive: true }).select('_id linkedCaregivers').lean();
    console.log(`[AnomalyCron] Starting daily check for ${elders.length} elder(s)...`);

    for (const elder of elders) {
      const elderId = elder._id.toString();
      try {
        const aiRes = await axios.post(
          `${AI_URL}/anomaly/detect`,
          { elderId },
          { timeout: 30_000 }
        );

        const { anomalies = [] } = aiRes.data;

        // Create Alert docs + emit sockets for each new anomaly
        for (const anomaly of anomalies) {
          try {
            await Alert.create({
              elderId,
              type:    anomaly.type || 'anomaly',
              message: buildAnomalyMessage(anomaly),
              meta:    { ...anomaly.details, severity: anomaly.severity },
              isRead:  false,
            });

            // Emit to linked caregivers
            for (const cgId of elder.linkedCaregivers || []) {
              emitToUser(cgId.toString(), EVENTS.ALERT_ANOMALY, {
                elderId,
                type:       anomaly.type,
                severity:   anomaly.severity,
                message:    buildAnomalyMessage(anomaly),
                detectedAt: new Date().toISOString(),
              });
            }
          } catch (alertErr) {
            console.error(`[AnomalyCron] Alert create error for elder ${elderId}:`, alertErr.message);
          }
        }

        console.log(`[AnomalyCron] Elder ${elderId} — ${anomalies.length} anomaly/anomalies detected`);

      } catch (elderErr) {
        // Don't let one elder's failure block the rest
        console.error(`[AnomalyCron] Failed for elder ${elderId}:`, elderErr.message);
      }
    }

    console.log('[AnomalyCron] Daily check complete.');
  } catch (err) {
    console.error('[AnomalyCron] Daily anomaly check failed:', err.message);
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Start all cron reminder jobs.
 * Call once during application bootstrap after DB is connected.
 */
export function startReminderJobs() {
  // Every minute — check for due medications
  cron.schedule('* * * * *', async () => {
    await runMinuteReminderJob();
  });

  // Every day at 22:00 local time — escalate missed doses to caregivers
  cron.schedule('0 22 * * *', async () => {
    console.log('[ReminderJob] Running nightly missed-dose sweep...');
    await runNightlyMissedDoseSweep();
  });

  // Every day at 09:00 local time — run anomaly detection for all active elders
  cron.schedule('0 9 * * *', async () => {
    console.log('[AnomalyCron] Running daily anomaly check at 09:00...');
    await runDailyAnomalyCheck();
  });

  console.log('[ReminderJob] Cron jobs started (every minute + nightly at 22:00 + anomaly at 09:00)');
}

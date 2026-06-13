'use strict';
/**
 * backend/src/routes/ai.js  MODIFY
 *
 * AI proxy routes — forwards requests to the Python FastAPI AI microservice.
 * All socket emissions happen here in Node (never from the AI service).
 *
 * Phase 4 additions:
 *   GET  /mood/:elderId/monthly       — 30-day mood data
 *   POST /anomaly/detect              — trigger anomaly detection + emit ALERT_ANOMALY
 *   GET  /anomaly/:elderId            — fetch anomaly flags
 *   PATCH /anomaly/:anomalyId/resolve — mark flag resolved
 *   POST /debug/run-anomaly-check     — dev-only bulk trigger (Task 10)
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { emitToUser } from '../sockets/index.js';
import { EVENTS } from '../sockets/events.js';
import User from '../models/User.js';
import Alert from '../models/Alert.js';
import { sendAnomalyAlert } from '../services/emailService.js';
import { sendSOS } from '../services/twilioService.js';

const router = Router();

// All AI routes require authentication
router.use(authenticate);

const AI_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map anomaly type → human-readable message for Alert.message */
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

/** Shared access-control check for elder/caregiver routes with an elderId param */
async function assertElderAccess(req, res, elderId) {
  if (req.user.role === 'elder') {
    if (req.user.id.toString() !== elderId) {
      res.status(403).json({ error: 'Access denied' });
      return false;
    }
  } else if (req.user.role === 'caregiver') {
    const caregiver = await User.findById(req.user.id).select('linkedElders').lean();
    const isLinked = caregiver?.linkedElders?.some((id) => id.toString() === elderId);
    if (!isLinked) {
      res.status(403).json({ error: 'Not authorised to access this elder' });
      return false;
    }
  }
  return true;
}

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
/**
 * @route  POST /api/ai/chat
 * @desc   Send a message to Saathi AI companion.
 *         Proxies to AI service, emits mood:updated to linked caregivers.
 * @access Private — elder role only
 */
router.post(
  '/chat',
  requireRole('elder'),
  [body('message').trim().notEmpty().withMessage('message is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { message } = req.body;
    const elderId = req.user.id.toString();
    const today = new Date().toISOString().slice(0, 10);

    try {
      const aiRes = await axios.post(
        `${AI_URL}/chat/`,
        { elderId, message },
        { timeout: 30_000 }
      );

      const { response, moodScore } = aiRes.data;

      // Emit mood:updated to every caregiver linked to this elder
      const elder = await User.findById(elderId).select('linkedCaregivers').lean();
      if (elder?.linkedCaregivers?.length) {
        const moodPayload = { elderId, moodScore, date: today };
        for (const cgId of elder.linkedCaregivers) {
          emitToUser(cgId.toString(), EVENTS.MOOD_UPDATED, moodPayload);
        }
      }

      return res.json({ response, moodScore });

    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.response === undefined) {
        console.warn('[AI/chat] AI service unreachable:', err.message);
        return res.status(503).json({
          error: 'Saathi is resting, please try again in a moment.',
        });
      }
      console.error('[AI/chat]', err);
      return res.status(500).json({ error: 'Chat failed' });
    }
  }
);

// ─── GET /api/ai/chat/history ─────────────────────────────────────────────────
/**
 * @route  GET /api/ai/chat/history
 * @desc   Return recent chat messages.
 * @access Private — elder (own) or caregiver (linked elder via ?elderId=)
 */
router.get('/chat/history', async (req, res) => {
  try {
    let elderId;

    if (req.user.role === 'elder') {
      elderId = req.user.id.toString();
    } else {
      const { elderId: qElderId } = req.query;
      if (!qElderId) {
        return res.status(400).json({ error: 'elderId query param required for caregiver' });
      }
      const caregiver = await User.findById(req.user.id).select('linkedElders').lean();
      const isLinked = caregiver?.linkedElders?.some((id) => id.toString() === qElderId);
      if (!isLinked) {
        return res.status(403).json({ error: 'Not authorised to view this elder\'s chat history' });
      }
      elderId = qElderId;
    }

    const aiRes = await axios.get(`${AI_URL}/chat/history/${elderId}`, {
      params: { limit: 50 },
      timeout: 10_000,
    });

    return res.json(aiRes.data);

  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.response === undefined) {
      return res.json([]);
    }
    console.error('[AI/chat/history]', err);
    return res.status(500).json({ error: 'Could not fetch chat history' });
  }
});

// ─── POST /api/ai/summary ─────────────────────────────────────────────────────
/**
 * @route  POST /api/ai/summary
 * @desc   Generate a caregiver daily digest for a linked elder.
 * @access Private — caregiver only
 */
router.post(
  '/summary',
  requireRole('caregiver', 'admin'),
  [body('elderId').notEmpty().isMongoId().withMessage('Valid elderId is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { elderId } = req.body;

    if (req.user.role === 'caregiver') {
      const caregiver = await User.findById(req.user.id).select('linkedElders').lean();
      const isLinked = caregiver?.linkedElders?.some((id) => id.toString() === elderId);
      if (!isLinked) {
        return res.status(403).json({ error: 'Not authorised to view this elder\'s summary' });
      }
    }

    try {
      const aiRes = await axios.post(
        `${AI_URL}/chat/summary`,
        { elderId },
        { timeout: 30_000 }
      );
      return res.json(aiRes.data);

    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.response === undefined) {
        console.warn('[AI/summary] AI service unreachable:', err.message);
        return res.json({
          summary: 'Summary unavailable — Saathi may be resting.',
          generatedAt: new Date().toISOString(),
        });
      }
      console.error('[AI/summary]', err);
      return res.status(500).json({ error: 'Could not generate summary' });
    }
  }
);

// ─── GET /api/ai/mood/:elderId/monthly ───────────────────────────────────────
/**
 * @route  GET /api/ai/mood/:elderId/monthly
 * @desc   Return 30-day mood data (sparse — days with no data omitted).
 * @access Private — elder (own) or caregiver (linked)
 *
 * NOTE: This route MUST come before GET /mood/:elderId to avoid Express
 * matching "monthly" as the elderId param in the 7-day route.
 */
router.get('/mood/:elderId/monthly', async (req, res) => {
  const { elderId } = req.params;
  const allowed = await assertElderAccess(req, res, elderId);
  if (!allowed) return;

  try {
    const aiRes = await axios.get(`${AI_URL}/mood/${elderId}/monthly`, {
      timeout: 10_000,
    });
    return res.json(aiRes.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.response === undefined) {
      return res.json({ userId: elderId, scores: [], dayCount: 0 });
    }
    console.error('[AI/mood/monthly]', err);
    return res.status(500).json({ error: 'Could not fetch monthly mood data' });
  }
});

// ─── GET /api/ai/mood/:elderId ────────────────────────────────────────────────
/**
 * @route  GET /api/ai/mood/:elderId
 * @desc   Return 7-day mood data for an elder.
 * @access Private — elder (own) or caregiver (linked)
 */
router.get('/mood/:elderId', async (req, res) => {
  const { elderId } = req.params;
  const allowed = await assertElderAccess(req, res, elderId);
  if (!allowed) return;

  try {
    const aiRes = await axios.get(`${AI_URL}/mood/${elderId}`, {
      timeout: 10_000,
    });
    return res.json(aiRes.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.response === undefined) {
      return res.json([]);
    }
    console.error('[AI/mood]', err);
    return res.status(500).json({ error: 'Could not fetch mood data' });
  }
});

// ─── POST /api/ai/anomaly/detect ─────────────────────────────────────────────
/**
 * @route  POST /api/ai/anomaly/detect
 * @desc   Trigger anomaly detection for an elder.
 *         For each detected anomaly:
 *           - Creates an Alert doc in MongoDB
 *           - Emits ALERT_ANOMALY to all linked caregiver rooms
 * @access Private — caregiver or admin
 */
router.post(
  '/anomaly/detect',
  requireRole('caregiver', 'admin'),
  [body('elderId').notEmpty().isMongoId().withMessage('Valid elderId is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { elderId } = req.body;

    // Verify caregiver link
    if (req.user.role === 'caregiver') {
      const caregiver = await User.findById(req.user.id).select('linkedElders').lean();
      const isLinked = caregiver?.linkedElders?.some((id) => id.toString() === elderId);
      if (!isLinked) {
        return res.status(403).json({ error: 'Not authorised to run anomaly check for this elder' });
      }
    }

    try {
      // Call AI service anomaly detection pipeline
      const aiRes = await axios.post(
        `${AI_URL}/anomaly/detect`,
        { elderId },
        { timeout: 30_000 }
      );

      const { anomalies = [], payload } = aiRes.data;

      // Populate elder + linked caregivers (with contact info + prefs)
      const elder = await User.findById(elderId)
        .select('name linkedCaregivers')
        .populate('linkedCaregivers', 'email phone fcmToken notificationPrefs')
        .lean();

      const linkedCaregivers = elder?.linkedCaregivers || [];
      const elderName        = elder?.name || 'Your elder';

      // Collect high-severity anomalies for batched email
      const highSeverity = anomalies.filter((a) => a.severity === 'high');

      let alertsCreated = 0;

      for (const anomaly of anomalies) {
        // Create Alert doc in MongoDB
        const alertDoc = await Alert.create({
          elderId,
          type:    anomaly.type || 'anomaly',
          message: buildAnomalyMessage(anomaly),
          meta:    { ...anomaly.details, severity: anomaly.severity, score: anomaly.score },
          isRead:  false,
        });

        alertsCreated++;

        // Emit to all linked caregiver rooms
        const socketPayload = {
          elderId,
          anomalyId:  anomaly._id || null,
          alertId:    alertDoc._id.toString(),
          type:       anomaly.type,
          severity:   anomaly.severity,
          message:    buildAnomalyMessage(anomaly),
          details:    anomaly.details,
          detectedAt: new Date().toISOString(),
        };

        for (const cg of linkedCaregivers) {
          emitToUser(cg._id.toString(), EVENTS.ALERT_ANOMALY, socketPayload);
        }
      }

      // ── Send email + SMS for HIGH severity anomalies ─────────────────────────
      // Only send once per detect call (not once per anomaly) to avoid spam.
      if (highSeverity.length > 0) {
        for (const cg of linkedCaregivers) {
          const prefs = cg.notificationPrefs || {};
          // Default to true when prefs field doesn't exist (safe default per Rule 10)
          const wantsEmail = prefs.emailAnomalies !== false;
          const wantsSMS   = prefs.smsAnomalies   !== false;

          // Check notifiedCaregivers on each flag to avoid duplicates
          const unnotifiedHighFlags = highSeverity.filter(
            (a) => !a.notifiedCaregivers?.map(String).includes(cg._id.toString())
          );

          if (unnotifiedHighFlags.length === 0) continue;

          if (wantsEmail && cg.email) {
            await sendAnomalyAlert(cg.email, elderName, unnotifiedHighFlags);
          }

          if (wantsSMS && cg.phone) {
            const smsMsg = `ElderEase Alert: ${elderName} has ${unnotifiedHighFlags.length} high severity health alert(s). Please check the app.`;
            await sendSOS(cg.phone, elderName, smsMsg);
          }

          // Update notifiedCaregivers on AnomalyFlag via AI service
          for (const flag of unnotifiedHighFlags) {
            if (flag._id) {
              axios.patch(
                `${AI_URL}/anomaly/${flag._id}/notify`,
                { caregiverId: cg._id.toString() },
                { timeout: 5_000 }
              ).catch((e) => console.warn('[AI/anomaly/notify]', e.message));
            }
          }
        }
      }

      console.log(
        `[AI/anomaly/detect] Elder ${elderId}: ${anomalies.length} anomaly/anomalies, ${alertsCreated} alert(s) created`
      );

      return res.json({ anomalies, alertsCreated, payload });

    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.response === undefined) {
        console.warn('[AI/anomaly/detect] AI service unreachable:', err.message);
        return res.status(503).json({ error: 'Anomaly service unavailable' });
      }
      console.error('[AI/anomaly/detect]', err.response?.data || err.message);
      return res.status(500).json({ error: 'Anomaly detection failed' });
    }
  }
);

// ─── GET /api/ai/anomaly/:elderId ─────────────────────────────────────────────
/**
 * @route  GET /api/ai/anomaly/:elderId
 * @desc   Get anomaly flags for an elder (unresolved + recently resolved).
 * @access Private — elder or caregiver (linked)
 */
router.get('/anomaly/:elderId', async (req, res) => {
  const { elderId } = req.params;
  const allowed = await assertElderAccess(req, res, elderId);
  if (!allowed) return;

  try {
    const aiRes = await axios.get(`${AI_URL}/anomaly/${elderId}`, { timeout: 10_000 });
    return res.json(aiRes.data);
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.response === undefined) {
      return res.json({ elderId, flags: [], count: 0 });
    }
    console.error('[AI/anomaly/get]', err);
    return res.status(500).json({ error: 'Could not fetch anomaly flags' });
  }
});

// ─── PATCH /api/ai/anomaly/:anomalyId/resolve ─────────────────────────────────
/**
 * @route  PATCH /api/ai/anomaly/:anomalyId/resolve
 * @desc   Mark an anomaly flag as resolved.
 * @access Private — caregiver or admin
 */
router.patch('/anomaly/:anomalyId/resolve', requireRole('caregiver', 'admin'), async (req, res) => {
  const { anomalyId } = req.params;

  try {
    const aiRes = await axios.patch(
      `${AI_URL}/anomaly/${anomalyId}/resolve`,
      {},
      { timeout: 10_000 }
    );
    return res.json(aiRes.data); // { success, resolvedAt }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.response === undefined) {
      return res.status(503).json({ error: 'AI service unavailable' });
    }
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Anomaly flag not found' });
    }
    console.error('[AI/anomaly/resolve]', err);
    return res.status(500).json({ error: 'Could not resolve anomaly flag' });
  }
});

// ─── POST /api/ai/debug/run-anomaly-check ────────────────────────────────────
/**
 * @route  POST /api/ai/debug/run-anomaly-check
 * @desc   Dev-only: manually trigger the anomaly detection pipeline.
 *         Body: { elderId? } — if omitted, runs for ALL active elders.
 * @access Development only (NODE_ENV=development)
 */
router.post('/debug/run-anomaly-check', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.sendStatus(403);
  }

  const { elderId } = req.body || {};

  try {
    let elders = [];

    if (elderId) {
      const elder = await User.findById(elderId).select('_id').lean();
      if (!elder) return res.status(404).json({ error: 'Elder not found' });
      elders = [elder];
    } else {
      elders = await User.find({ role: 'elder', isActive: true }).select('_id').lean();
    }

    const results = [];

    for (const elder of elders) {
      const eid = elder._id.toString();
      try {
        const aiRes = await axios.post(
          `${AI_URL}/anomaly/detect`,
          { elderId: eid },
          { timeout: 30_000 }
        );
        const { anomalies = [], payload } = aiRes.data;

        // Create Alert docs and emit sockets (same as /anomaly/detect)
        const elderDoc = await User.findById(eid).select('linkedCaregivers').lean();
        const linkedCaregivers = elderDoc?.linkedCaregivers || [];
        let alertsCreated = 0;

        for (const anomaly of anomalies) {
          await Alert.create({
            elderId: eid,
            type:    anomaly.type || 'anomaly',
            message: buildAnomalyMessage(anomaly),
            meta:    { ...anomaly.details, severity: anomaly.severity },
            isRead:  false,
          });
          alertsCreated++;
          for (const cgId of linkedCaregivers) {
            emitToUser(cgId.toString(), EVENTS.ALERT_ANOMALY, {
              elderId: eid, type: anomaly.type, severity: anomaly.severity,
              message: buildAnomalyMessage(anomaly), detectedAt: new Date().toISOString(),
            });
          }
        }

        console.log(`[DEBUG/anomaly] Elder ${eid}: ${anomalies.length} anomaly/anomalies`);
        results.push({ elderId: eid, anomalyCount: anomalies.length, alertsCreated, payload });

      } catch (elderErr) {
        console.error(`[DEBUG/anomaly] Elder ${eid} failed:`, elderErr.message);
        results.push({ elderId: eid, error: elderErr.message });
      }
    }

    return res.json({ results });

  } catch (err) {
    console.error('[DEBUG/anomaly]', err);
    return res.status(500).json({ error: 'Debug anomaly check failed' });
  }
});

export default router;

// backend/src/routes/notifications.js  MODIFIED
'use strict';

/**
 * Notification routes — SOS alerts, history, and resolution.
 *
 * Phase 5 changes:
 *   POST /sos          — now writes Alert doc to DB (fixes Phase 4 gap)
 *   GET  /sos/history  — reads from Alert model (not AnomalyFlag)
 *   PATCH /sos/:id/resolve — mark an SOS alert as read/resolved
 */

import { Router } from 'express';
import { param, query } from 'express-validator';

import { authenticate } from '../middleware/auth.js';
import { requireRole }  from '../middleware/roleGuard.js';
import { emitToUser }   from '../sockets/index.js';
import { EVENTS }       from '../sockets/events.js';
import { sendSOS }      from '../services/twilioService.js';
import { sendSOSAlert } from '../services/fcmService.js';
import User             from '../models/User.js';
import Alert            from '../models/Alert.js';

const router = Router();
router.use(authenticate);

// ─── POST /api/notifications/sos ─────────────────────────────────────────────
/**
 * @route  POST /api/notifications/sos
 * @desc   Broadcast SOS from elder. Persists Alert doc, emits socket,
 *         sends SMS (Twilio) and push (FCM) to all linked caregivers.
 * @access Private — elder only
 */
router.post('/sos', requireRole('elder'), async (req, res) => {
  try {
    const { message } = req.body;

    const elder = await User.findById(req.user.id)
      .populate('linkedCaregivers', 'name phone fcmToken email notificationPrefs')
      .lean();

    if (!elder) return res.status(404).json({ error: 'Elder not found' });

    const sosMessage = message || 'SOS triggered by elder';

    // ── Persist Alert doc ──────────────────────────────────────────────────────
    const alertDoc = await Alert.create({
      elderId: req.user.id,
      type:    'sos',
      message: sosMessage,
      meta:    { triggeredAt: new Date(), elderName: elder.name },
      isRead:  false,
    });

    const sosPayload = {
      elderId:   req.user.id.toString(),
      elderName: elder.name,
      alertId:   alertDoc._id.toString(),
      message:   sosMessage,
      timestamp: new Date().toISOString(),
    };

    let notifiedCount = 0;

    // ── Notify each linked caregiver ───────────────────────────────────────────
    for (const cg of elder.linkedCaregivers) {
      // Socket
      emitToUser(cg._id.toString(), EVENTS.ALERT_SOS, sosPayload);

      // Twilio SMS
      await sendSOS(cg.phone, elder.name, sosMessage);

      // FCM push
      if (cg.fcmToken) {
        await sendSOSAlert(cg.fcmToken, elder.name);
      }

      notifiedCount++;
    }

    console.log(
      `[Notifications/sos] SOS from ${elder.name} → alertId=${alertDoc._id} notified=${notifiedCount} caregivers`
    );

    return res.status(200).json({
      alertId:        alertDoc._id,
      notified:       notifiedCount,
      message:        'SOS broadcast successfully',
    });
  } catch (err) {
    console.error('[Notifications/sos]', err);
    return res.status(500).json({ error: 'SOS broadcast failed' });
  }
});

// ─── GET /api/notifications/sos/history ──────────────────────────────────────
/**
 * @route  GET /api/notifications/sos/history
 * @desc   Return SOS Alert history.
 *         Elder: own SOS history.
 *         Caregiver: SOS alerts for all linked elders.
 * @query  limit  Max records to return (default 20)
 * @access Private
 */
router.get('/sos/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    let filter = { type: 'sos' };

    if (req.user.role === 'elder') {
      filter.elderId = req.user.id;
    } else {
      // Caregiver sees SOS for all their linked elders
      const cg = await User.findById(req.user.id).select('linkedElders').lean();
      filter.elderId = { $in: cg?.linkedElders || [] };
    }

    const history = await Alert.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('elderId', 'name avatarUrl profilePhoto')
      .lean();

    return res.json(history);
  } catch (err) {
    console.error('[Notifications/sos/history]', err);
    return res.status(500).json({ error: 'Could not fetch SOS history' });
  }
});

// ─── PATCH /api/notifications/sos/:alertId/resolve ───────────────────────────
/**
 * @route  PATCH /api/notifications/sos/:alertId/resolve
 * @desc   Mark an SOS alert as resolved (isRead=true + meta.resolvedAt).
 *         Only linked caregivers or admins may resolve.
 * @access Private — caregiver or admin
 */
router.patch(
  '/sos/:alertId/resolve',
  requireRole('caregiver', 'admin'),
  [param('alertId').isMongoId().withMessage('Invalid alertId')],
  async (req, res) => {
    try {
      const { alertId } = req.params;

      const alert = await Alert.findById(alertId);
      if (!alert) return res.status(404).json({ error: 'SOS alert not found' });
      if (alert.type !== 'sos') return res.status(400).json({ error: 'Alert is not an SOS' });

      // Verify caregiver is linked to the elder who triggered this SOS
      if (req.user.role === 'caregiver') {
        const cg = await User.findById(req.user.id).select('linkedElders').lean();
        const isLinked = cg?.linkedElders?.map(String).includes(alert.elderId.toString());
        if (!isLinked) {
          return res.status(403).json({ error: 'Not authorised to resolve this SOS' });
        }
      }

      const updated = await Alert.findByIdAndUpdate(
        alertId,
        {
          $set: {
            isRead:              true,
            'meta.resolvedAt':   new Date(),
            'meta.resolvedBy':   req.user.id,
          },
        },
        { new: true }
      ).lean();

      console.log(`[Notifications/sos/resolve] alertId=${alertId} resolved by ${req.user.id}`);
      return res.json(updated);
    } catch (err) {
      console.error('[Notifications/sos/resolve]', err);
      return res.status(500).json({ error: 'Could not resolve SOS alert' });
    }
  }
);

export default router;

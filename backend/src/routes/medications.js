'use strict';
import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import mongoose from 'mongoose';

import Medication from '../models/Medication.js';
import DoseLog from '../models/DoseLog.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';
import { emitToUser } from '../sockets/index.js';
import { EVENTS } from '../sockets/events.js';
import { runNightlyMissedDoseSweep } from '../jobs/reminderJob.js';

const router = Router();
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Automatically ensure DoseLogs for today are created for all active medications. */
export async function ensureTodayDoseLogs(elderId) {
  try {
    const meds = await Medication.find({ elderId, isActive: true }).lean();
    if (meds.length === 0) return;

    const today = new Date();
    const logsToCreate = [];

    for (const med of meds) {
      for (const timeStr of med.scheduledTimes || []) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const scheduledTime = new Date(today);
        scheduledTime.setHours(hours, minutes, 0, 0);

        // Check if log already exists within a ±30-second window
        const windowStart = new Date(scheduledTime.getTime() - 30_000);
        const windowEnd = new Date(scheduledTime.getTime() + 30_000);

        const existing = await DoseLog.findOne({
          medicationId: med._id,
          elderId,
          scheduledTime: { $gte: windowStart, $lte: windowEnd }
        });

        if (!existing) {
          logsToCreate.push({
            medicationId: med._id,
            elderId,
            scheduledTime,
            status: 'pending',
          });
        }
      }
    }

    if (logsToCreate.length > 0) {
      await DoseLog.insertMany(logsToCreate, { ordered: false }).catch(() => {});
      console.log(`[DoseLog/Auto] Pre-created ${logsToCreate.length} logs for elder ${elderId}`);
    }
  } catch (err) {
    console.error('[ensureTodayDoseLogs] failed:', err);
  }
}

/**
 * Resolve the elderId from request — elders always get their own ID,
 * caregivers supply ?elderId= query param.
 */
function resolveElderId(req) {
  if (req.user.role === 'elder') return req.user.id;
  return req.query.elderId || null;
}

/** Get today's date as YYYY-MM-DD using local time. */
function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get local midnight and end-of-day as Date objects. */
function getTodayBounds() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

// ─── GET /api/medications ─────────────────────────────────────────────────────
/**
 * @route  GET /api/medications
 * @desc   List all active medications for an elder.
 *         Elders see their own; caregivers pass ?elderId=
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const elderId = resolveElderId(req);
    if (!elderId) return res.status(400).json({ error: 'elderId query param required for caregivers' });
    if (!mongoose.Types.ObjectId.isValid(elderId)) return res.status(400).json({ error: 'Invalid elderId' });

    const meds = await Medication.find({ elderId, isActive: true }).sort({ createdAt: -1 });
    return res.json(meds);
  } catch (err) {
    console.error('[Medications/GET]', err);
    return res.status(500).json({ error: 'Could not fetch medications' });
  }
});

// ─── POST /api/medications ────────────────────────────────────────────────────
/**
 * @route  POST /api/medications
 * @desc   Create a new medication and generate today's DoseLogs
 * @access Private
 */
router.post(
  '/',
  [
    body('elderId').if(body('elderId').exists()).isMongoId().withMessage('Invalid elderId'),
    body('name').trim().notEmpty().withMessage('name is required'),
    body('dose').trim().notEmpty().withMessage('dose is required'),
    body('frequency')
      .isIn(['once_daily', 'twice_daily', 'thrice_daily', 'weekly', 'as_needed', 'daily', 'twice', 'three'])
      .withMessage('Invalid frequency'),
    body('scheduledTimes').optional().isArray(),
    body('color').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const elderId = req.user.role === 'elder' ? req.user.id : req.body.elderId;
      if (!elderId) return res.status(400).json({ error: 'elderId is required for caregivers' });

      const { name, dose, frequency, scheduledTimes, instructions, startDate, endDate, color } = req.body;

      const med = await Medication.create({
        elderId,
        name,
        dose,
        frequency,
        scheduledTimes: scheduledTimes || [],
        instructions,
        startDate,
        endDate,
        color: color || '#2BBD8E',
      });

      // Create DoseLogs for today for each scheduled time (status: pending)
      const today = new Date();
      const doseLogs = (scheduledTimes || []).map((timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const scheduled = new Date(today);
        scheduled.setHours(hours, minutes, 0, 0);
        return {
          medicationId: med._id,
          elderId,
          scheduledTime: scheduled,
          status: 'pending',
        };
      });

      if (doseLogs.length > 0) {
        await DoseLog.insertMany(doseLogs, { ordered: false }).catch(() => {});
      }

      return res.status(201).json(med);
    } catch (err) {
      console.error('[Medications/POST]', err);
      return res.status(500).json({ error: 'Could not create medication' });
    }
  }
);

// ─── DEBUG — POST /api/medications/debug/run-sweep ────────────────────────────
/**
 * @route  POST /api/medications/debug/run-sweep
 * @desc   Manually triggers the nightly missed-dose sweep for local testing.
 *         DEVELOPMENT ONLY — returns 403 in production.
 * @access Private (dev only)
 */
router.post('/debug/run-sweep', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.sendStatus(403);
  }
  try {
    console.log('[DEBUG] Manual nightly sweep triggered via API');
    const result = await runNightlyMissedDoseSweep();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[DEBUG/run-sweep]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/medications/today/:elderId ──────────────────────────────────────
/**
 * @route  GET /api/medications/today/:elderId
 * @desc   Returns today's DoseLogs joined with medication info for the elder.
 *         Elders can only access their own data. Caregivers can access any
 *         linked elder.
 * @access Private (elder: own data only | caregiver: any linked elder)
 */
router.get('/today/:elderId', async (req, res) => {
  try {
    const { elderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(elderId)) {
      return res.status(400).json({ error: 'Invalid elderId' });
    }

    // Enforce elder can only access their own data
    if (req.user.role === 'elder' && req.user.id !== elderId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Ensure today's DoseLogs are initialized
    await ensureTodayDoseLogs(elderId);

    const { dayStart, dayEnd } = getTodayBounds();

    // Fetch all active meds for the elder
    const meds = await Medication.find({ elderId, isActive: true }).lean();
    if (meds.length === 0) return res.json([]);

    const medMap = {};
    meds.forEach((m) => { medMap[m._id.toString()] = m; });
    const medIds = meds.map((m) => m._id);

    // Fetch today's DoseLogs for those medications
    const logs = await DoseLog.find({
      medicationId: { $in: medIds },
      elderId,
      scheduledTime: { $gte: dayStart, $lte: dayEnd },
    })
      .sort({ scheduledTime: 1 })
      .lean();

    // Join with medication data
    const enriched = logs.map((log) => {
      const med = medMap[log.medicationId.toString()] || {};
      const scheduledDate = new Date(log.scheduledTime);
      const hh = String(scheduledDate.getHours()).padStart(2, '0');
      const mm = String(scheduledDate.getMinutes()).padStart(2, '0');
      return {
        _id: log._id,
        medicationId: log.medicationId,
        name: med.name || 'Unknown',
        dose: med.dose || '',
        color: med.color || '#2BBD8E',
        instructions: med.instructions || '',
        scheduledTime: `${hh}:${mm}`,
        scheduledAt: log.scheduledTime,
        takenAt: log.takenAt || null,
        status: log.status,
      };
    });

    return res.json(enriched);
  } catch (err) {
    console.error('[Medications/today]', err);
    return res.status(500).json({ error: 'Could not fetch today\'s doses' });
  }
});

// ─── GET /api/medications/adherence/:elderId ──────────────────────────────────
/**
 * @route  GET /api/medications/adherence/:elderId
 * @desc   Per-medication adherence stats for the last N days (default 14, max 30).
 *         Returns one entry per active medication with taken/missed counts
 *         and overall adherence percentage.
 * @access Private
 * @query  ?days=14
 */
router.get('/adherence/:elderId', async (req, res) => {
  try {
    const { elderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(elderId)) {
      return res.status(400).json({ error: 'Invalid elderId' });
    }

    const days = Math.min(parseInt(req.query.days, 10) || 14, 30);
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - (days - 1));
    windowStart.setHours(0, 0, 0, 0);

    // Get all active medications for the elder
    const meds = await Medication.find({ elderId, isActive: true }).lean();
    if (meds.length === 0) return res.json([]);

    const medIds = meds.map((m) => m._id);

    // Fetch all DoseLogs in the window for these medications
    const logs = await DoseLog.find({
      elderId,
      medicationId: { $in: medIds },
      scheduledTime: { $gte: windowStart },
      status: { $in: ['taken', 'missed'] }, // exclude pending
    }).lean();

    // Group logs by medicationId
    const logsByMed = {};
    for (const log of logs) {
      const key = log.medicationId.toString();
      if (!logsByMed[key]) logsByMed[key] = { taken: 0, missed: 0 };
      if (log.status === 'taken') logsByMed[key].taken++;
      else if (log.status === 'missed') logsByMed[key].missed++;
    }

    // Build per-medication result
    const result = meds.map((med) => {
      const stats = logsByMed[med._id.toString()] || null;
      const taken = stats?.taken ?? 0;
      const missed = stats?.missed ?? 0;
      const total = taken + missed;
      return {
        medicationId: med._id,
        name: med.name,
        dose: med.dose,
        color: med.color || '#2BBD8E',
        frequency: med.frequency,
        taken,
        missed,
        adherencePct: total > 0 ? Math.round((taken / total) * 100) : null,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('[Medications/adherence]', err);
    return res.status(500).json({ error: 'Could not calculate adherence' });
  }
});

// ─── GET /api/medications/logs/elder/:elderId ─────────────────────────────────
/**
 * @route  GET /api/medications/logs/elder/:elderId
 * @desc   All DoseLogs for all of an elder's medications in a date window.
 *         Used by the caregiver MedicationTimelinePage 14-day grid.
 *         Returns logs enriched with medication name and color.
 * @access Private
 * @query  ?days=14
 */
router.get('/logs/elder/:elderId', async (req, res) => {
  try {
    const { elderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(elderId)) {
      return res.status(400).json({ error: 'Invalid elderId' });
    }

    const days = Math.min(parseInt(req.query.days, 10) || 14, 30);
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - (days - 1));
    windowStart.setHours(0, 0, 0, 0);

    const meds = await Medication.find({ elderId, isActive: true }).lean();
    if (meds.length === 0) return res.json([]);

    const medMap = {};
    meds.forEach((m) => { medMap[m._id.toString()] = m; });
    const medIds = meds.map((m) => m._id);

    const logs = await DoseLog.find({
      elderId,
      medicationId: { $in: medIds },
      scheduledTime: { $gte: windowStart },
    })
      .sort({ scheduledTime: 1 })
      .lean();

    const enriched = logs.map((log) => {
      const med = medMap[log.medicationId.toString()] || {};
      return {
        _id: log._id,
        medicationId: log.medicationId,
        medicationName: med.name || 'Unknown',
        color: med.color || '#2BBD8E',
        scheduledTime: log.scheduledTime,
        takenAt: log.takenAt || null,
        status: log.status,
      };
    });

    return res.json(enriched);
  } catch (err) {
    console.error('[Medications/logs/elder]', err);
    return res.status(500).json({ error: 'Could not fetch dose logs' });
  }
});

// ─── GET /api/medications/:id ─────────────────────────────────────────────────
/**
 * @route  GET /api/medications/:id
 * @desc   Get a single medication by ID
 * @access Private
 */
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid medication ID' });
    }
    const med = await Medication.findById(req.params.id);
    if (!med) return res.status(404).json({ error: 'Medication not found' });
    return res.json(med);
  } catch (err) {
    console.error('[Medications/GET:id]', err);
    return res.status(500).json({ error: 'Could not fetch medication' });
  }
});

// ─── PATCH /api/medications/:id ───────────────────────────────────────────────
/**
 * @route  PATCH /api/medications/:id
 * @desc   Update a medication
 * @access Private
 */
router.patch(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('dose').optional().trim().notEmpty(),
    body('frequency').optional().isIn(['once_daily', 'twice_daily', 'thrice_daily', 'weekly', 'as_needed', 'daily', 'twice', 'three']),
    body('scheduledTimes').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid medication ID' });
      }

      const med = await Medication.findById(req.params.id);
      if (!med) return res.status(404).json({ error: 'Medication not found' });

      // Update fields
      Object.assign(med, req.body);
      await med.save();

      // Sync today's pending DoseLogs if scheduledTimes or isActive was updated
      if (req.body.scheduledTimes !== undefined || req.body.isActive !== undefined) {
        const today = new Date();
        const dayStart = new Date(today);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(today);
        dayEnd.setHours(23, 59, 59, 999);

        // Delete all today's pending DoseLogs for this medication
        await DoseLog.deleteMany({
          medicationId: med._id,
          status: 'pending',
          scheduledTime: { $gte: dayStart, $lte: dayEnd }
        });

        if (med.isActive) {
          // Re-create pending logs for today's scheduled times if not already present (taken/missed/skipped)
          for (const timeStr of med.scheduledTimes || []) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const scheduledTime = new Date(today);
            scheduledTime.setHours(hours, minutes, 0, 0);

            const windowStart = new Date(scheduledTime.getTime() - 30_000);
            const windowEnd = new Date(scheduledTime.getTime() + 30_000);

            const existing = await DoseLog.findOne({
              medicationId: med._id,
              scheduledTime: { $gte: windowStart, $lte: windowEnd }
            });

            if (!existing) {
              await DoseLog.create({
                medicationId: med._id,
                elderId: med.elderId,
                scheduledTime,
                status: 'pending',
              });
            }
          }
        }
      }

      // Notify elder (and caregivers) that medications have changed
      emitToUser(med.elderId.toString(), 'medications:changed', { medicationId: med._id, action: 'update' });

      return res.json(med);
    } catch (err) {
      console.error('[Medications/PATCH:id]', err);
      return res.status(500).json({ error: 'Could not update medication' });
    }
  }
);

// ─── DELETE /api/medications/:id ─────────────────────────────────────────────
/**
 * @route  DELETE /api/medications/:id
 * @desc   Soft-delete a medication (sets isActive=false)
 * @access Private
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid medication ID' });
    }
    const med = await Medication.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!med) return res.status(404).json({ error: 'Medication not found' });

    // Clean up today's pending DoseLogs for this medication so they immediately disappear
    const today = new Date();
    const dayStart = new Date(today);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(today);
    dayEnd.setHours(23, 59, 59, 999);

    await DoseLog.deleteMany({
      medicationId: med._id,
      status: 'pending',
      scheduledTime: { $gte: dayStart, $lte: dayEnd }
    });

    // Notify elder that medication list has changed
    emitToUser(med.elderId.toString(), 'medications:changed', { medicationId: med._id, action: 'delete' });

    return res.json({ message: 'Medication deactivated', id: med._id });
  } catch (err) {
    console.error('[Medications/DELETE:id]', err);
    return res.status(500).json({ error: 'Could not delete medication' });
  }
});

// ─── POST /api/medications/:id/take ──────────────────────────────────────────
/**
 * @route  POST /api/medications/:id/take
 * @desc   Mark a specific scheduled dose as taken.
 *         Requires { scheduledTime } in the body — the ISO timestamp of the
 *         dose the elder is confirming. Looks up the exact DoseLog by
 *         medicationId + scheduledTime (±60s window).
 *         Emits DOSE_TAKEN to elder room + all linked caregiver rooms.
 * @access Private (elder role)
 */
router.post(
  '/:id/take',
  [
    body('scheduledTime')
      .notEmpty()
      .withMessage('scheduledTime is required')
      .isISO8601()
      .withMessage('scheduledTime must be a valid ISO 8601 timestamp'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid medication ID' });
      }

      const med = await Medication.findById(req.params.id).lean();
      if (!med) return res.status(404).json({ error: 'Medication not found' });

      const requestedTime = new Date(req.body.scheduledTime);
      // ±60-second window to tolerate minor clock skew between client and server
      const windowStart = new Date(requestedTime.getTime() - 60_000);
      const windowEnd = new Date(requestedTime.getTime() + 60_000);

      const doseLog = await DoseLog.findOne({
        medicationId: med._id,
        elderId: med.elderId,
        scheduledTime: { $gte: windowStart, $lte: windowEnd },
      });

      if (!doseLog) {
        return res.status(404).json({ error: 'Dose log not found for this scheduled time' });
      }

      if (doseLog.status === 'taken') {
        return res.status(400).json({ error: 'Already confirmed as taken' });
      }

      const now = new Date();
      doseLog.status = 'taken';
      doseLog.takenAt = now;
      await doseLog.save();

      // Fetch elder for caregiver room lookups
      const elder = await User.findById(med.elderId)
        .populate('linkedCaregivers', '_id')
        .lean();

      const eventPayload = {
        elderId: med.elderId.toString(),
        elderName: elder?.name || '',
        medicationId: med._id.toString(),
        medicationName: med.name,
        dose: med.dose,
        takenAt: now.toISOString(),
        scheduledTime: requestedTime.toISOString(),
      };

      // Notify elder's own room (confirms on their UI)
      emitToUser(med.elderId.toString(), EVENTS.DOSE_TAKEN, eventPayload);

      // Notify all linked caregivers
      for (const cg of elder?.linkedCaregivers || []) {
        emitToUser(cg._id.toString(), EVENTS.DOSE_TAKEN, eventPayload);
      }

      return res.json({ message: 'Dose marked as taken', doseLog });
    } catch (err) {
      console.error('[Medications/take]', err);
      return res.status(500).json({ error: 'Could not mark dose as taken' });
    }
  }
);

// ─── GET /api/medications/:id/logs ───────────────────────────────────────────
/**
 * @route  GET /api/medications/:id/logs
 * @desc   Get dose history for a specific medication with optional date range
 * @access Private
 */
router.get(
  '/:id/logs',
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid medication ID' });
      }

      const filter = { medicationId: req.params.id };
      if (req.query.startDate || req.query.endDate) {
        filter.scheduledTime = {};
        if (req.query.startDate) filter.scheduledTime.$gte = new Date(req.query.startDate);
        if (req.query.endDate) filter.scheduledTime.$lte = new Date(req.query.endDate);
      }

      const logs = await DoseLog.find(filter).sort({ scheduledTime: -1 }).limit(200);
      return res.json(logs);
    } catch (err) {
      console.error('[Medications/logs]', err);
      return res.status(500).json({ error: 'Could not fetch dose logs' });
    }
  }
);

export default router;

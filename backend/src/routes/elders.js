'use strict';
import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';

const router = Router();
router.use(authenticate);

// ─── GET /api/elders/linked ───────────────────────────────────────────────────
router.get('/linked', requireRole('caregiver', 'admin'), async (req, res) => {
  try {
    const caregiver = await User.findById(req.user.id)
      .populate('linkedElders', '-passwordHash')
      .lean();

    if (!caregiver) return res.status(404).json({ error: 'Caregiver not found' });
    return res.json({ elders: caregiver.linkedElders || [] });
  } catch (err) {
    console.error('[Elders/linked]', err);
    return res.status(500).json({ error: 'Could not fetch linked elders' });
  }
});

// ─── POST /api/elders/link ────────────────────────────────────────────────────
router.post('/link', requireRole('caregiver', 'admin'), async (req, res) => {
  try {
    const { elderId, email } = req.body;

    if (!elderId && !email) {
      return res.status(400).json({ error: 'Either elderId or email is required' });
    }

    let elder = null;

    if (elderId) {
      if (!mongoose.Types.ObjectId.isValid(elderId)) {
        return res.status(400).json({ error: 'Invalid elderId' });
      }
      elder = await User.findOne({ _id: elderId, role: 'elder' });
    } else if (email) {
      elder = await User.findOne({ email: email.trim().toLowerCase(), role: 'elder' });
    }

    if (!elder) return res.status(404).json({ error: 'Elder not found' });

    const caregiver = await User.findById(req.user.id);
    if (!caregiver) return res.status(404).json({ error: 'Caregiver not found' });

    const elderIdStr = elder._id.toString();

    // Idempotent linking
    if (!caregiver.linkedElders.map(String).includes(elderIdStr)) {
      caregiver.linkedElders.push(elder._id);
      await caregiver.save();
    }

    if (!elder.linkedCaregivers.map(String).includes(req.user.id)) {
      elder.linkedCaregivers.push(caregiver._id);
      await elder.save();
    }

    // Return the linked elder profile (sans password)
    const linkedElderProfile = await User.findById(elder._id).select('-passwordHash').lean();
    return res.json({ elder: linkedElderProfile });
  } catch (err) {
    console.error('[Elders/link]', err);
    return res.status(500).json({ error: 'Could not link elder' });
  }
});

// ─── GET /api/elders/:elderId ─────────────────────────────────────────────────
router.get('/:elderId', requireRole('caregiver', 'admin'), async (req, res) => {
  try {
    const { elderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(elderId)) {
      return res.status(400).json({ error: 'Invalid elderId' });
    }

    const caregiver = await User.findById(req.user.id).select('linkedElders').lean();
    const isLinked = caregiver?.linkedElders?.map(String).includes(elderId);

    if (!isLinked && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden — not linked to this elder' });
    }

    const elder = await User.findById(elderId).select('-passwordHash').lean();
    if (!elder) return res.status(404).json({ error: 'Elder not found' });

    return res.json({ elder });
  } catch (err) {
    console.error('[Elders/:elderId]', err);
    return res.status(500).json({ error: 'Could not fetch elder details' });
  }
});

export default router;

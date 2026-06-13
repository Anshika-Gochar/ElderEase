'use strict';
import { Router } from 'express';
import mongoose from 'mongoose';
import Alert from '../models/Alert.js';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleGuard.js';

const router = Router();
router.use(authenticate);

// ─── GET /api/alerts ──────────────────────────────────────────────────────────
router.get('/', requireRole('caregiver', 'admin'), async (req, res) => {
  try {
    const caregiver = await User.findById(req.user.id).select('linkedElders').lean();
    if (!caregiver) return res.status(404).json({ error: 'Caregiver not found' });

    const alerts = await Alert.find({ elderId: { $in: caregiver.linkedElders || [] } })
      .sort({ createdAt: -1 })
      .populate('elderId', 'name profilePhoto avatarUrl')
      .lean();

    // Map fields for frontend compatibility (both isRead and read)
    const mappedAlerts = alerts.map((a) => ({
      ...a,
      read: a.isRead,
    }));

    const unreadCount = mappedAlerts.filter((a) => !a.read).length;

    return res.json({ alerts: mappedAlerts, unreadCount });
  } catch (err) {
    console.error('[Alerts GET]', err);
    return res.status(500).json({ error: 'Could not fetch alerts' });
  }
});

// ─── PATCH /api/alerts/:id/read ────────────────────────────────────────────────
router.patch('/:id/read', requireRole('caregiver', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await Alert.findByIdAndUpdate(
      id,
      { $set: { isRead: true } },
      { new: true }
    );

    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    return res.json({ success: true, alert });
  } catch (err) {
    console.error('[Alerts PATCH]', err);
    return res.status(500).json({ error: 'Could not update alert status' });
  }
});

export default router;

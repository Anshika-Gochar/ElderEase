'use strict';
import { Router }                             from 'express';
import { body, param, query, validationResult } from 'express-validator';
import mongoose                               from 'mongoose';
import multer                                 from 'multer';
import path                                   from 'path';
import fs                                     from 'fs';
import { fileURLToPath }                      from 'url';

import User             from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole }  from '../middleware/roleGuard.js';

// ── Multer config for avatar uploads ────────────────────────────────────────────
const __filename    = fileURLToPath(import.meta.url);
const __dirname_us  = path.dirname(__filename);
const AVATAR_DIR    = path.join(__dirname_us, '..', '..', 'uploads', 'avatars');

// Ensure directory exists at startup
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `avatar-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits:  { fileSize: 2 * 1024 * 1024 },   // 2 MB
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are accepted'), false);
    }
  },
});

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── GET /api/users/profile ───────────────────────────────────────────────────
/**
 * @route  GET /api/users/profile
 * @desc   Return the authenticated user's full profile (sans passwordHash)
 * @access Private
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-passwordHash')
      .populate('linkedElders', 'name email profilePhoto phone')
      .populate('linkedCaregivers', 'name email profilePhoto phone')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (err) {
    console.error('[Users/profile]', err);
    return res.status(500).json({ error: 'Could not fetch profile' });
  }
});

// ─── PATCH /api/users/profile ─────────────────────────────────────────────────
/**
 * @route  PATCH /api/users/profile
 * @desc   Update the authenticated user's profile fields
 * @access Private
 */
router.patch(
  '/profile',
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().trim(),
    body('profilePhoto').optional().isURL().withMessage('profilePhoto must be a valid URL'),
    body('fcmToken').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, phone, profilePhoto, fcmToken } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (phone !== undefined) updates.phone = phone;
      if (profilePhoto !== undefined) updates.profilePhoto = profilePhoto;
      if (fcmToken !== undefined) updates.fcmToken = fcmToken;

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true, runValidators: true }
      ).select('-passwordHash');

      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json(user);
    } catch (err) {
      console.error('[Users/profile PATCH]', err);
      return res.status(500).json({ error: 'Could not update profile' });
    }
  }
);

// ─── GET /api/users/elders ────────────────────────────────────────────────────
/**
 * @route  GET /api/users/elders
 * @desc   Return all elders linked to this caregiver
 * @access Private — caregiver, admin
 */
router.get('/elders', requireRole('caregiver', 'admin'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('linkedElders', '-passwordHash')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user.linkedElders);
  } catch (err) {
    console.error('[Users/elders]', err);
    return res.status(500).json({ error: 'Could not fetch elders' });
  }
});

// ─── POST /api/users/link-elder ───────────────────────────────────────────────
/**
 * @route  POST /api/users/link-elder
 * @desc   Caregiver links themselves to an elder by the elder's MongoDB ID or Email
 * @access Private — caregiver
 */
router.post(
  '/link-elder',
  requireRole('caregiver', 'admin'),
  async (req, res) => {
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

      return res.json({ message: 'Linked successfully', elderId });
    } catch (err) {
      console.error('[Users/link-elder]', err);
      return res.status(500).json({ error: 'Could not link elder' });
    }
  }
);

// ─── POST /api/users/fcm-token ────────────────────────────────────────────────
/**
 * @route  POST /api/users/fcm-token
 * @desc   Register or refresh the FCM device token for the current user.
 *         Called from the frontend after Notification permission is granted.
 * @access Private — any role
 */
router.post(
  '/fcm-token',
  [body('fcmToken').trim().notEmpty().withMessage('fcmToken is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { fcmToken } = req.body;

      await User.findByIdAndUpdate(req.user.id, { $set: { fcmToken } });
      console.log(`[Users/fcm-token] Token registered for user ${req.user.id}`);
      return res.json({ success: true });
    } catch (err) {
      console.error('[Users/fcm-token]', err);
      return res.status(500).json({ error: 'Could not register FCM token' });
    }
  }
);

// ─── PATCH /api/users/notification-prefs ──────────────────────────────────────
/**
 * @route  PATCH /api/users/notification-prefs
 * @desc   Update per-user notification channel preferences.
 *         Controls whether email/SMS is sent for anomaly alerts and digests.
 * @access Private — any role
 */
router.patch(
  '/notification-prefs',
  [
    body('emailAnomalies').optional().isBoolean().withMessage('emailAnomalies must be boolean'),
    body('smsAnomalies').optional().isBoolean().withMessage('smsAnomalies must be boolean'),
    body('emailDigest').optional().isBoolean().withMessage('emailDigest must be boolean'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { emailAnomalies, smsAnomalies, emailDigest } = req.body;

      const updates = {};
      if (emailAnomalies !== undefined) updates['notificationPrefs.emailAnomalies'] = emailAnomalies;
      if (smsAnomalies   !== undefined) updates['notificationPrefs.smsAnomalies']   = smsAnomalies;
      if (emailDigest    !== undefined) updates['notificationPrefs.emailDigest']     = emailDigest;

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No preference fields provided' });
      }

      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true, runValidators: true }
      ).select('notificationPrefs');

      if (!user) return res.status(404).json({ error: 'User not found' });

      console.log(`[Users/notification-prefs] Updated for user ${req.user.id}`);
      return res.json({ success: true, notificationPrefs: user.notificationPrefs });
    } catch (err) {
      console.error('[Users/notification-prefs]', err);
      return res.status(500).json({ error: 'Could not update notification preferences' });
    }
  }
);

// ─── GET /api/users/:id ───────────────────────────────────────────────────────
/**
 * @route  GET /api/users/:id
 * @desc   Get any user by ID. Accessible by admins or linked users.
 * @access Private
 */
router.get(
  '/:id',
  [param('id').notEmpty().withMessage('User ID is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      const requester = await User.findById(req.user.id);
      if (!requester) return res.status(404).json({ error: 'Requester not found' });

      const isAdmin            = requester.role === 'admin';
      const isSelf             = req.user.id === id;
      const isLinkedElder      = requester.role === 'caregiver' && requester.linkedElders.map(String).includes(id);
      const isLinkedCaregiver  = requester.role === 'elder' && requester.linkedCaregivers.map(String).includes(id);

      if (!isAdmin && !isSelf && !isLinkedElder && !isLinkedCaregiver) {
        return res.status(403).json({ error: 'Forbidden — not linked to this user' });
      }

      const target = await User.findById(id).select('-passwordHash').lean();
      if (!target) return res.status(404).json({ error: 'User not found' });

      return res.json(target);
    } catch (err) {
      console.error('[Users/:id]', err);
      return res.status(500).json({ error: 'Could not fetch user' });
    }
  }
);

// ─── POST /api/users/avatar ──────────────────────────────────────────────────────────
/**
 * @route  POST /api/users/avatar
 * @desc   Upload a profile avatar. Accepts multipart/form-data with field 'avatar'.
 *         Old avatar file is deleted automatically.
 *         The static URL is served at /uploads/avatars/<filename>.
 * @access Private — any role
 */
router.post(
  '/avatar',
  (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large — maximum size is 2 MB' });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded — send a file in the "avatar" field' });
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      // Delete previous avatar file if one exists
      const existing = await User.findById(req.user.id).select('avatarUrl').lean();
      if (existing?.avatarUrl) {
        const oldPath = path.join(__dirname_us, '..', '..', existing.avatarUrl);
        fs.unlink(oldPath, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            console.warn('[Users/avatar] Could not delete old avatar:', unlinkErr.message);
          }
        });
      }

      await User.findByIdAndUpdate(req.user.id, { $set: { avatarUrl } });
      console.log(`[Users/avatar] Updated avatar for user ${req.user.id} → ${avatarUrl}`);

      return res.json({ success: true, avatarUrl });
    } catch (err) {
      console.error('[Users/avatar]', err);
      return res.status(500).json({ error: 'Could not upload avatar' });
    }
  }
);

export default router;

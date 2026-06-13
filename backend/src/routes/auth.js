'use strict';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';

import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { verifyFirebaseToken } from '../config/firebase.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Apply strict rate limiting to all auth routes
router.use(authLimiter);

// ─── Validation Chains ────────────────────────────────────────────────────────
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['elder', 'caregiver', 'admin']).withMessage('Invalid role'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── POST /api/auth/register ──────────────────────────────────────────────────
/**
 * @route  POST /api/auth/register
 * @desc   Register a new user with email/password
 * @access Public
 */
router.post('/register', registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    // Check for existing user
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: role || 'elder',
    });

    const token = generateToken({ id: user._id, email: user.email, role: user.role });

    return res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePhoto: user.profilePhoto,
      },
    });
  } catch (err) {
    console.error('[Auth/register]', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
/**
 * @route  POST /api/auth/login
 * @desc   Login with email + password
 * @access Public
 */
router.post('/login', loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Update lastSeen
    user.lastSeen = new Date();
    await user.save();

    const token = generateToken({ id: user._id, email: user.email, role: user.role });

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePhoto: user.profilePhoto,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error('[Auth/login]', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/auth/firebase-auth ─────────────────────────────────────────────
/**
 * @route  POST /api/auth/firebase-auth
 * @desc   Authenticate or register a user via Firebase ID token
 * @access Public
 */
router.post('/firebase-auth', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const firebaseUser = await verifyFirebaseToken(idToken);

    // Find or create user in MongoDB
    let user = await User.findOne({ firebaseUid: firebaseUser.uid });

    if (!user) {
      // Try to find by email first (user may have registered locally before)
      user = await User.findOne({ email: firebaseUser.email });
      if (user) {
        // Link the firebase UID to the existing user
        user.firebaseUid = firebaseUser.uid;
        await user.save();
      } else {
        // Create a brand-new user from Firebase data
        user = await User.create({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email || `${firebaseUser.uid}@firebase.user`,
          name: firebaseUser.name || firebaseUser.email?.split('@')[0] || 'ElderEase User',
          profilePhoto: firebaseUser.picture || null,
          role: 'elder', // default role; caregivers register separately
        });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    user.lastSeen = new Date();
    await user.save();

    const token = generateToken({ id: user._id, email: user.email, role: user.role });

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePhoto: user.profilePhoto,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error('[Auth/firebase-auth]', err);
    return res.status(500).json({ error: 'Firebase authentication failed' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
/**
 * @route  GET /api/auth/me
 * @desc   Return the currently authenticated user's profile
 * @access Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-passwordHash')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);
  } catch (err) {
    console.error('[Auth/me]', err);
    return res.status(500).json({ error: 'Could not fetch user' });
  }
});

export default router;

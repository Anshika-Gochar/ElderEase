'use strict';
import { verifyToken } from '../utils/jwt.js';
import { verifyFirebaseToken } from '../config/firebase.js';
import User from '../models/User.js';

/**
 * Authentication middleware.
 * Tries JWT first, falls back to Firebase ID token verification.
 * On success sets req.user = { id, email, role } and calls next().
 * On failure returns 401 Unauthorized.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized — no token provided' });
    }

    const token = authHeader.split(' ')[1];
    let userId = null;

    // ── 1. Try JWT ────────────────────────────────────────────────────────────
    try {
      const decoded = verifyToken(token);
      req.user = { id: decoded.id, email: decoded.email, role: decoded.role };
      return next();
    } catch (_jwtErr) {
      // JWT failed — attempt Firebase
    }

    // ── 2. Try Firebase ID Token ──────────────────────────────────────────────
    try {
      const firebaseUser = await verifyFirebaseToken(token);
      // Look up the corresponding MongoDB user by firebaseUid
      const dbUser = await User.findOne({ firebaseUid: firebaseUser.uid }).lean();
      if (!dbUser) {
        return res.status(401).json({ error: 'Unauthorized — user not found' });
      }
      req.user = { id: dbUser._id.toString(), email: dbUser.email, role: dbUser.role };
      return next();
    } catch (fbErr) {
      console.error('[Auth] Firebase token verification failed:', fbErr.message);
    }

    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  } catch (err) {
    console.error('[Auth] Unexpected error:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export default authenticate;

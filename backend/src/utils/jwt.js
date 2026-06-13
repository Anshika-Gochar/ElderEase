'use strict';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'elderease_default_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a signed JWT for a given payload.
 *
 * @param {object} payload - Data to encode (e.g. { id, email, role }).
 * @returns {string} Signed JWT string.
 */
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token.
 *
 * @param {string} token - The JWT string to verify.
 * @returns {object} Decoded payload.
 * @throws {JsonWebTokenError|TokenExpiredError} If the token is invalid or expired.
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

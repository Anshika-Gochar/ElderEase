'use strict';

/**
 * Role-based access guard middleware factory.
 * Returns an Express middleware that allows only users whose role is in the
 * provided list, otherwise returns 403 Forbidden.
 *
 * @param {...string} roles - Allowed roles (e.g. 'caregiver', 'admin').
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/admin-only', authenticate, requireRole('admin'), handler);
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized — not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden — requires role: ${roles.join(' or ')}`,
      });
    }

    return next();
  };
}

export default requireRole;

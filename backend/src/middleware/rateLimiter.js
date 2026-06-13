'use strict';
import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter.
 * Allows up to 100 requests per 15-minute window per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again after 15 minutes.' },
});

/**
 * Stricter rate limiter for authentication routes.
 * Allows up to 10 requests per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts — please try again after 15 minutes.' },
});
